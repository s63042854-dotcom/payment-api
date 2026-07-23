const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Payment API is running!');
});

app.post('/create-payment', async (req, res) => {
  try {
    const { amount, currency, paymentMethodId } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency || 'eur',
      payment_method: paymentMethodId,
      confirm: true,
    });
    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
