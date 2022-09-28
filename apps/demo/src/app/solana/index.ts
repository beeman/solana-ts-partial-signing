import {
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

const REMOTE_FEE_PAYER_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array([
    251, 250, 215, 164, 5, 65, 45, 223, 129, 110, 254, 210, 136, 194, 238, 45,
    179, 49, 42, 41, 49, 110, 170, 53, 205, 72, 220, 13, 169, 152, 130, 155,
    210, 143, 171, 12, 86, 21, 178, 27, 134, 179, 155, 149, 210, 81, 140, 224,
    169, 110, 26, 52, 198, 149, 69, 164, 147, 12, 14, 86, 85, 75, 136, 253,
  ])
);

export async function main() {
  const client = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const feePayer = REMOTE_FEE_PAYER_KEYPAIR.publicKey;
  const owner = Keypair.generate();
  const mint = new PublicKey('KinDesK3dYWo3R2wDk6Ucaf31tvQCCSYyL8Fuqp33GX');

  const [localBalance, remoteBalance] = await Promise.all([
    client.getBalance(owner.publicKey),
    client.getBalance(feePayer),
  ]);

  console.log(` -> local owner     : ${owner.publicKey.toString()}`);
  console.log(` -> local balance   : ${localBalance}`);
  console.log(` -> remote fee payer: ${feePayer.toString()}`);
  console.log(` -> remote balance  : ${remoteBalance}`);

  // Get the data from Solana
  const { blockhash, lastValidBlockHeight } = await client.getLatestBlockhash();
  console.log(blockhash);

  // Handle the local part that happens on the users' device without access to REMOTE_FEE_PAYER_KEYPAIR
  const associatedTokenAccount = await getAssociatedTokenAddress(
    mint,
    owner.publicKey
  );

  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountInstruction(
      feePayer,
      associatedTokenAccount,
      owner.publicKey,
      mint
    ),
    createSetAuthorityInstruction(
      associatedTokenAccount,
      owner.publicKey,
      AuthorityType.CloseAccount,
      feePayer
    ),
  ];

  const transaction = new Transaction({
    blockhash,
    feePayer,
    lastValidBlockHeight,
    signatures: [
      // This is what we seem to miss in solana-py
      { publicKey: owner.publicKey, signature: null },
    ],
  }).add(...instructions);

  // Partially sign the transaction with the owner
  transaction.partialSign(owner);

  // Serialize so we can ship it
  const serializedTransaction = transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');

  // // // // // // // // // // // //
  // Now it's sent over the wire.  //
  // // // // // // // // // // // //

  // De-serialize it
  const received = Transaction.from(
    Buffer.from(serializedTransaction, 'base64')
  );

  // Handle the remote part
  received.partialSign(...[REMOTE_FEE_PAYER_KEYPAIR]);

  // Send it
  const tx = await client.sendRawTransaction(received.serialize());

  // Log it
  console.log(` -> transaction: ${serializedTransaction}`);
  console.log(
    ` -> transaction sent: https://explorer.solana.com/tx/${tx}?cluster=devnet`
  );
}
