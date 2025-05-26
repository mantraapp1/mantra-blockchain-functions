// api/stellar-admin-wallet.js
import { NextResponse } from 'next/server';
import StellarSdk from 'stellar-sdk';

export default async function handler(req, res) {
  // Read secrets from Vercel env variables
  const adminSecret = process.env.ADMIN_STELLAR_SECRET;
  const adminPublic = process.env.ADMIN_STELLAR_PUBLIC;
  const network = process.env.STELLAR_NETWORK || 'testnet';
  const horizonUrl = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';

  const server = new StellarSdk.Server(horizonUrl);
  const adminKeypair = StellarSdk.Keypair.fromSecret(adminSecret);

  // Example: Get balance
  if (req.method === 'GET') {
    try {
      const account = await server.loadAccount(adminPublic);
      const balanceObj = account.balances.find(b => b.asset_type === 'native');
      return res.status(200).json({ balance: balanceObj.balance });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Example: Send XLM (POST body: { destination, amount })
  if (req.method === 'POST') {
    const { destination, amount } = req.body;
    try {
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
      return res.status(200).json({ result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}