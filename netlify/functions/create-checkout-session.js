const Stripe = require("stripe");

exports.handler = async (event) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { items, success_url, cancel_url } = JSON.parse(event.body || "{}");

    const line_items = (items || []).map((it) => ({
      price_data: {
        currency: "eur",
        product_data: { name: it.name },
        unit_amount: it.unit_amount, // en centimes
      },
      quantity: it.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url,
      cancel_url,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
