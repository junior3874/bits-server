const yup = require('yup');

const TransactionModel = require('../models/transactions/TransactionStore');

function TransactionsController(database) {
  const transactionModel = new TransactionModel(database);

  async function store(request, response) {
    const bodySchema = yup.object().shape({
      walletId: yup.number().positive().required(),
      amount: yup.number().required(),
      incoming: yup.boolean(),
      categoryId: yup.number().positive(),
      description: yup.string(),
    });

    if (!(await bodySchema.isValid(request.body))) {
      return response.status(400).json({ message: 'Validation failed!' });
    }

    const { amount, incoming, categoryId, walletId, description } =
      request.body;

    // const wallet = await database('wallet')
    //   .where({
    //     id: walletId,
    //   })
    //   .select('*')
    //   .first();

    // if (!wallet) {
    //   return response.status(404).json({
    //     message: 'Wallet not found',
    //   });
    // }

    // const [transaction] = await database('transaction')
    //   .insert({
    //     category_id: categoryId,
    //     wallet_id: walletId,
    //     amount,
    //     incoming,
    //     description,
    //   })
    //   .returning('*');
    try {
      const transaction = await transactionModel.store({
        amount,
        incoming,
        category_id: categoryId,
        wallet_id: walletId,
        description,
      });

      return response.status(201).json({ ...transaction });
    } catch (err) {
      return response.status(404).json({
        message: 'Wallet not found',
      });
    }
  }

  async function destroy(request, response) {
    const { id } = request.params;

    const transaction = await database('transaction')
      .where({ id })
      .select('*')
      .first();

    if (!transaction) {
      return response.status(400).json({
        message: 'Transaction not found',
      });
    }

    await transactionModel.destroy(id);

    return response.status(200).end();
  }

  async function update(request, response) {
    const { amount, description } = request.body;

    if (!amount && !description) {
      return response.status(400).json({ message: 'Validation failed!' });
    }

    const { id } = request.params;

    const transaction = await database('transaction')
      .where({ id })
      .select('*')
      .first();

    if (!transaction) {
      return response.status(404).json({ message: 'Transaction not found' });
    }

    const updatedTransaction = await transactionModel.update(
      amount,
      description,
      id
    );

    return response.status(200).json({ ...updatedTransaction });
  }

  async function show(request, response) {
    const { id } = request.params;

    const transaction = await database('transaction')
      .where({ id })
      .select('*')
      .first();

    if (!transaction) {
      return response.status(404).json({
        message: 'Transaction not found',
      });
    }

    return response.status(200).json({ ...transaction });
  }

  async function index(request, response) {
    function validateDate(date) {
      var matches = /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})$/.exec(date);
      if (!matches) {
        return false;
      }

      const [year, month, day] = date.split('-');
      month == '12' ? (month = '11') : null;
      const dateObject = new Date(year, month, day);

      if (
        Number(year) != dateObject.getFullYear() ||
        Number(month) != dateObject.getMonth() ||
        Number(day) != dateObject.getDate()
      ) {
        return false;
      }
    }

    const querySchema = yup.object().shape({
      date: yup.string().transform(validateDate),
      page: yup.number().positive(),
      timezoneOffset: yup.number().integer(),
    });

    if (!(await querySchema.isValid(request.query))) {
      return response.status(400).json({ message: 'Validation failed!' });
    }

    const { id: userId } = request.userData;
    const { date, page = 1, timezoneOffset = 0 } = request.query;

    const limitElementsForPage = 10;

    const transactionsQuery = database('transaction')
      .limit(limitElementsForPage)
      .offset((page - 1) * limitElementsForPage)
      .leftJoin('wallet', 'wallet.id', '=', 'transaction.wallet_id')
      .innerJoin('user', 'user.id', '=', 'wallet.user_id')
      .where('user.id', `${userId}`)
      .orderBy('created_at', 'desc')
      .select('transaction.*', 'wallet.name as wallet_name');

    if (date) {
      let [year, month, day] = date.split('-');
      month == '12' ? (month = '11') : null;
      const formattedDate = new Date(
        year,
        month,
        day,
        23 + timezoneOffset,
        59,
        59
      );
      transactionsQuery.andWhere('created_at', '<=', formattedDate);
    }
    const transactions = await transactionsQuery;

    if (transactions.length == 0) {
      return response.status(404).json({
        message: "you don't have transactions in date",
      });
    }

    return response.status(200).json({ transactions });
  }

  async function getExpensesAndIncomes(request, response) {
    const querySchema = yup.object().shape({
      year: yup.number().min(2021).required(),
      month: yup.number().min(1).max(12).required(),
      timezoneOffset: yup.number().integer(),
    });

    if (!(await querySchema.isValid(request.query))) {
      return response.status(400).json({ message: 'Validation failed!' });
    }

    const { year, month, timezoneOffset = 0 } = request.query;
    const { id: userId } = request.userData;

    const walletsUsersIds = await database('wallet')
      .where({ user_id: userId })
      .select('id')
      .then(data => data.map(a => a.id));

    const monthIndex = month - 1;
    const from = new Date(year, monthIndex, 1);
    const to = new Date(
      year,
      monthIndex + 1,
      0,
      23 + timezoneOffset / 60,
      59,
      59
    );

    const transactions = await database('transaction')
      .whereIn('wallet_id', walletsUsersIds)
      .whereBetween('created_at', [from, to])
      .select('*');

    let data = {};

    walletsUsersIds.forEach(id => {
      if (!(id in data)) {
        data[id] = {
          expenses: 0,
          incomes: 0,
        };
      }
    });

    data = transactions.reduce((acc, transaction, _) => {
      if (transaction.amount < 0) {
        acc[`${transaction.wallet_id}`].expenses += transaction.amount;
      } else {
        acc[`${transaction.wallet_id}`].incomes += transaction.amount;
      }

      return acc;
    }, data);

    return response.status(200).json({ expensesAndIncome: data });
  }

  return {
    store,
    destroy,
    update,
    show,
    index,
    getExpensesAndIncomes,
  };
}

module.exports = TransactionsController;
