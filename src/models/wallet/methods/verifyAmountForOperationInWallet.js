module.exports = async function (db, transaction_amount, wallet_id) {
  const [wallet] = await db('wallet').where({ id: wallet_id });

  return wallet;
};
