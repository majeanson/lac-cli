export async function handleStripeWebhook(payload: string, sig: string) {
  const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_SECRET)
  if (event.type === 'checkout.session.completed') {
    await activateSubscription(event.data.object.customer)
  }
}
