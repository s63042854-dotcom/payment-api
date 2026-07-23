const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, paymentMethodId } = req.body;
    const amountInCents = Math.round(parseFloat(amount) * 100);

    if (!amountInCents || amountInCents < 50) {
      return res.status(400).json({ error: 'المبلغ غير صالح (الحد الأدنى 0.50 يورو)' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      payment_method: paymentMethodId,
      confirm: true,
      capture_method: 'manual',
      description: 'دفع عبر الموقع',
    });

    res.json({
      success: true,
      message: 'تم استلام طلب الدفع، ستتم الموافقة عليه عبر لوحة تحكم Stripe',
      transaction: {
        id: paymentIntent.id,
        amount: amount,
        status: paymentIntent.status,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
