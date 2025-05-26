// Import Stellar SDK using CommonJS require (for v8.2.3)
const { Server, Keypair, Networks, TransactionBuilder, Operation, Asset } = require('stellar-sdk');

// Export the handler function for Vercel's Node.js serverless API route.
module.exports = async function handler(req, res) {
  // Read secrets and config from environment variables set in Vercel dashboard.
  const adminSecret = process.env.ADMIN_STELLAR_SECRET;
  const adminPublic = process.env.ADMIN_STELLAR_PUBLIC;
  const network = process.env.STELLAR_NETWORK || 'testnet';

  // Choose the correct Horizon URL based on the network.
  const horizonUrl = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';

  // Initialize the Stellar server connection.
  const server = new Server(horizonUrl);

  // Handle GET requests: Return the admin wallet's XLM balance.
  if (req.method === 'GET') {
    try {
      // Load the admin account from the Stellar network.
      const account = await server.loadAccount(adminPublic);
      // Find the native (XLM) balance.
      const balanceObj = account.balances.find(b => b.asset_type === 'native');
      // Respond with the balance as JSON.
      res.status(200).json({ balance: balanceObj.balance });
    } catch (err) {
      // Handle errors (e.g., account not found).
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // Handle POST requests: Send XLM from admin to a destination address.
  if (req.method === 'POST') {
    let body = req.body;
    // If req.body is not already parsed, parse it as JSON.
    if (!body) {
      try {
        body = JSON.parse(await getRawBody(req));
      } catch (e) {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }
    }
    const { destination, amount } = body;
    // Validate required fields.
    if (!destination || !amount) {
      res.status(400).json({ error: 'Missing destination or amount' });
      return;
    }
    try {
      // Create the admin keypair from the secret.
      const adminKeypair = Keypair.fromSecret(adminSecret);
      // Load the admin account from the Stellar network.
      const account = await server.loadAccount(adminKeypair.publicKey());
      // Fetch the current base fee for transactions.
      const fee = await server.fetchBaseFee();
      // Build a transaction to send XLM.
      const tx = new TransactionBuilder(account, {
        fee,
        networkPassphrase: network === 'testnet'
          ? Networks.TESTNET
          : Networks.PUBLIC
      })
        .addOperation(Operation.payment({
          destination,
          asset: Asset.native(),
          amount: amount.toString()
        }))
        .setTimeout(30)
        .build();

      // Sign the transaction with the admin's secret key.
      tx.sign(adminKeypair);
      // Submit the transaction to the Stellar network.
      const result = await server.submitTransaction(tx);
      // Respond with the transaction result.
      res.status(200).json({ result });
    } catch (err) {
      // Handle errors (e.g., bad destination, insufficient funds).
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // For any other HTTP methods, return "Method Not Allowed".
  res.status(405).json({ error: 'Method not allowed' });
};

// Helper for raw body parsing (for POST requests).
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });
}