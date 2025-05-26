// api/stellar-admin-wallet.js
import StellarSdk from 'stellar-sdk';

export default async function handler(req, res) {
  const adminSecret = process.env.ADMIN_STELLAR_SECRET;
  const adminPublic = process.env.ADMIN_STELLAR_PUBLIC;
  const network = process.env.STELLAR_NETWORK || 'testnet';
  const horizonUrl = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';

  const server = new StellarSdk.Server(horizonUrl);

  // GET: Return admin wallet balance
  if (req.method === 'GET') {
    try {
      const account = await server.loadAccount(adminPublic);
      const balanceObj = account.balances.find(b => b.asset_type === 'native');
      res.status(200).json({ balance: balanceObj.balance });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // POST: Send XLM from admin to destination
  if (req.method === 'POST') {
    // For Vercel/Node.js API routes, parse JSON body if not already parsed
    let body = req.body;
    if (!body) {
      try {
        body = JSON.parse(await getRawBody(req));
      } catch (e) {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }
    }
    const { destination, amount } = body;
    if (!destination || !amount) {
      res.status(400).json({ error: 'Missing destination or amount' });
      return;
    }
    try {
      const adminKeypair = StellarSdk.Keypair.fromSecret(adminSecret);
      const account = await server.loadAccount(adminKeypair.publicKey());
      const fee = await server.fetchBaseFee();
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee,
        networkPassphrase: network === 'testnet'
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC
      })
        .addOperation(StellarSdk.Operation.payment({
          destination,
          asset: StellarSdk.Asset.native(),
          amount: amount.toString()
        }))
        .setTimeout(30)
        .build();

      tx.sign(adminKeypair);
      const result = await server.submitTransaction(tx);
      res.status(200).json({ result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // Method not allowed
  res.status(405).json({ error: 'Method not allowed' });
}

// Helper for raw body parsing (for POST requests)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });
}