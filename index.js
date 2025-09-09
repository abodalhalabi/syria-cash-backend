require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const TronWeb = require('tronweb');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

app.post('/withdraw', async (req, res) => {
  const { userId, amount, method, account, transactionId } = req.body;

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('id', userId)
      .single();
    if (userError || !user) {
      return res.status(400).json({ success: false, error: 'المستخدم غير موجود' });
    }

    const pointsNeeded = amount * 20000;
    if (user.balance < pointsNeeded) {
      return res.status(400).json({ success: false, error: 'رصيد غير كافٍ' });
    }

    if (method === 'USDT-TRC20') {
      const isValidAddress = await tronWeb.isAddress(account);
      if (!isValidAddress) {
        return res.status(400).json({ success: false, error: 'عنوان TRC20 غير صالح' });
      }

      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      const amountInSun = amount * 1000000;

      const transaction = await contract.transfer(account, amountInSun).send({
        from: tronWeb.defaultAddress.base58,
        feeLimit: 10000000
      });

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ status: 'completed', tx_hash: transaction })
        .eq('id', transactionId);
      if (updateError) throw updateError;

      const { error: balanceError } = await supabase
        .from('users')
        .update({ balance: user.balance - pointsNeeded })
        .eq('id', userId);
      if (balanceError) throw balanceError;

      return res.json({ success: true, txHash: transaction });
    } else {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ status: 'pending' })
        .eq('id', transactionId);
      if (updateError) throw updateError;

      return res.json({ success: true, message: 'تم إرسال طلب السحب للمعالجة اليدوية' });
    }
  } catch (error) {
    console.error('Withdraw error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
