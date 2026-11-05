/* Copy to payments-config.js and paste your GHL membership checkout URL.
   GHL: Payments → product “AAO Membership” → Order Form / Payment Link.
   See hanap/payments/README.md for the full setup. */
window.AAO_PAYMENTS = {
  /* Full https URL to the GHL checkout. Leave "" to use in-app #membership. */
  membershipCheckoutUrl: "",
  /* Shown on the membership page */
  planLabel: "AAO Membership",
  planPrice: "$79/mo",
  /* Thank-you after payment — prefer:
     …/pages/membership-thanks.html?paid=1
     SPA fallback: #membership?paid=1 */
  successHash: "#membership?paid=1",
  thanksPagePath: "pages/membership-thanks.html?paid=1"
};
