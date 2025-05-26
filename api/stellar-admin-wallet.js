// api/stellar-admin-wallet.js

// Import required classes from the Stellar SDK (ESM import style)
import { Server, Keypair, Networks, TransactionBuilder, Operation, Asset } from 'stellar-sdk';

// Tell Vercel to run this as an Edge Function (supports ESM and modern APIs)
export const config = {
  runtime: 'edge',
};

// Main handler function for the API route
export default async function handler(req) {
  // Read environment variables (set in Vercel dashboard)
  const { ADMIN_STELLAR_SECRET, ADMIN_STELLAR_PUBLIC, STELLAR_NETWORK } = process.env;
  const network = STELLAR_NETWORK || 'testnet';

  // Choose the correct Horizon URL based on the network
  const horizonUrl = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';

  // Initialize the Stellar server connection
  const server = new Server(horizonUrl);

  // Handle GET requests: Return the admin wallet's XLM balance
  if (req.method === 'GET') {
    try {
      // Load the admin account from the Stellar network
      const account = await server.loadAccount(ADMIN_STELLAR_PUBLIC);
      // Find the native (XLM) balance
      const balanceObj = account.balances.find(b => b.asset_type === 'native');
      // Respond with the balance as JSON
      return new Response(JSON.stringify({ balance: balanceObj.balance }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      // Handle errors (e.g., account not found)
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Handle POST requests: Send XLM from admin to a destination address
  if (req.method === 'POST') {
    let body;
    try {
      // Parse the request body as JSON
      body = await req.json();
    } catch {
      // If JSON is invalid, return an error
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { destination, amount } = body;
    // Validate required fields
    if (!destination || !amount) {
      return new Response(JSON.stringify({ error: 'Missing destination or amount' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      // Create the admin keypair from the secret
      const adminKeypair = Keypair.fromSecret(ADMIN_STELLAR_SECRET);
      // Load the admin account from the Stellar network
      const account = await server.loadAccount(adminKeypair.publicKey());
      // Fetch the current base fee for transactions
      const fee = await server.fetchBaseFee();
      // Build a transaction to send XLM
      const tx = new TransactionBuilder(account, {
        fee,
        networkPassphrase: network === 'testnet'
          ? Networks.TESTNET
          : Networks.PUBLIC,
      })
        .addOperation(Operation.payment({
          destination,
          asset: Asset.native(),
          amount: amount.toString(),
        }))
        .setTimeout(30)
        .build();

      // Sign the transaction with the admin's secret key
      tx.sign(adminKeypair);
      // Submit the transaction to the Stellar network
      const result = await server.submitTransaction(tx);
      // Respond with the transaction result
      return new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      // Handle errors (e.g., bad destination, insufficient funds)
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // For any other HTTP methods, return "Method Not Allowed"
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}