const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// قاعدة بيانات وهمية في الذاكرة
let transactions = [];
let pendingApprovals = [];

// ========== واجهة العميل ==========
app.get('/', (req, res) => {
  res.send('Payment API is running!');
});

// ========== إنشاء طلب دفع (معلق) ==========
app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, paymentMethodId } = req.body;
    const amountInCents = Math.round(parseFloat(amount) * 100);

    if (!amountInCents || amountInCents < 50) {
      return res.status(400).json({ error: 'المبلغ غير صالح (الحد الأدنى 0.50 يورو)' });
    }

    // إنشاء PaymentIntent مع حجز يدوي
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      payment_method: paymentMethodId,
      confirm: true,
      capture_method: 'manual', // هذا يمنع السحب الفوري
      description: 'دفع عبر الموقع - في انتظار الموافقة',
    });

    const transaction = {
      id: paymentIntent.id,
      amount: amount,
      amount_cents: amountInCents,
      status: 'pending',
      createdAt: new Date().toISOString(),
      stripeStatus: paymentIntent.status,
      paymentMethodId: paymentMethodId,
    };

    transactions.unshift(transaction);
    pendingApprovals.push(transaction.id);

    res.json({
      success: true,
      message: 'تم استلام طلب الدفع، في انتظار موافقة المكتب',
      transaction,
    });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// ========== عرض جميع المعاملات ==========
app.get('/api/transactions', (req, res) => {
  res.json(transactions);
});

// ========== الموافقة على الدفع ==========
app.post('/api/approve/:id', async (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة مرور خاطئة' });
  }

  try {
    const { id } = req.params;
    const captured = await stripe.paymentIntents.capture(id);

    transactions = transactions.map(t =>
      t.id === id ? { ...t, status: 'approved' } : t
    );
    pendingApprovals = pendingApprovals.filter(pid => pid !== id);

    res.json({ success: true, message: 'تمت الموافقة وسحب المبلغ بنجاح', captured });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========== رفض الدفع ==========
app.post('/api/reject/:id', async (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة مرور خاطئة' });
  }

  try {
    const { id } = req.params;
    const canceled = await stripe.paymentIntents.cancel(id);

    transactions = transactions.map(t =>
      t.id === id ? { ...t, status: 'rejected' } : t
    );
    pendingApprovals = pendingApprovals.filter(pid => pid !== id);

    res.json({ success: true, message: 'تم رفض الطلب وإلغاء الحجز', canceled });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========== لوحة التحكم الإدارية ==========
app.get('/admin', (req, res) => {
  res.send(`
    <html dir="rtl">
    <head><meta charset="UTF-8"><title>لوحة التحكم</title>
    <style>body{background:#0a0a0a;color:#fff;font-family:Arial;padding:20px;}
    table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #333;padding:10px;text-align:center;}
    .approve{background:#2d6eff;color:#fff;border:none;padding:5px 15px;border-radius:5px;cursor:pointer;}
    .reject{background:#d63031;color:#fff;border:none;padding:5px 15px;border-radius:5px;cursor:pointer;}
    .pending{color:#fdcb6e;}
    .approved{color:#4caf50;}
    .rejected{color:#d63031;}
    </style>
    </head>
    <body>
    <h1>📊 لوحة التحكم الإدارية</h1>
    <p>🔐 كلمة المرور الافتراضية: <strong>Sameer2024!</strong></p>
    <div id="transactions-list">جاري التحميل...</div>
    <script>
    const ADMIN_PASSWORD = prompt('أدخل كلمة المرور:');
    if (ADMIN_PASSWORD !== 'Sameer2024!') {
      document.body.innerHTML = '<h1 style="color:red;">❌ كلمة مرور خاطئة</h1>';
    } else {
      fetch('/api/transactions')
        .then(res => res.json())
        .then(data => {
          let html = '<table><tr><th>المبلغ</th><th>الحالة</th><th>التاريخ</th><th>الإجراء</th></tr>';
          data.forEach(t => {
            html += \`<tr>
              <td>\${t.amount} يورو</td>
              <td class="\${t.status}">\${t.status}</td>
              <td>\${new Date(t.createdAt).toLocaleString()}</td>
              <td>
                \${t.status === 'pending' ? \`
                  <button class="approve" onclick="approve('\${t.id}')">موافقة</button>
                  <button class="reject" onclick="reject('\${t.id}')">رفض</button>
                \` : 'لا يوجد إجراء'}
              </td>
            </tr>\`;
          });
          html += '</table>';
          document.getElementById('transactions-list').innerHTML = html;
        });
    }

    function approve(id) {
      fetch('/api/approve/' + id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: ADMIN_PASSWORD})
      })
      .then(res => res.json())
      .then(data => {
        alert(data.message);
        location.reload();
      });
    }

    function reject(id) {
      fetch('/api/reject/' + id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: ADMIN_PASSWORD})
      })
      .then(res => res.json())
      .then(data => {
        alert(data.message);
        location.reload();
      });
    }
    </script>
    </body>
    </html>
  `);
});

// ========== نقطة الصحة ==========
app.get('/healthz', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));