const Stripe = require("stripe");

exports.handler = async (event) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { items, success_url, cancel_url } = JSON.parse(event.body || "{}");

    if (!success_url || !cancel_url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing success_url or cancel_url." }),
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Cart is empty." }),
      };
    }

    const line_items = items.map((it) => {
      const unit_amount = Number(it.unit_amount);
      const quantity = Number(it.quantity);

      if (!it.name || !Number.isFinite(unit_amount) || unit_amount < 50) {
        throw new Error("Invalid item: name/unit_amount");
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new Error("Invalid item: quantity");
      }

      return {
        price_data: {
          currency: "eur",
          product_data: { name: String(it.name) },
          unit_amount: Math.round(unit_amount), // centimes
        },
        quantity,
      };
    });

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
