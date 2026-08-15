/**
 * A Spanish mobile number the form will actually accept.
 *
 * Every lead spec needs a number nobody else is using, so they derive one from
 * the clock. That is where this became a trap: the app validates with
 * `libphonenumber-js/max`, whose metadata knows Spanish *number types*, and the
 * 79 prefix is not an assigned mobile range. A spec building `+34 7<clock>`
 * therefore passed or failed depending on the time of day — and when it failed
 * it read as "lead capture is broken" rather than "the test invented a number
 * that cannot exist".
 *
 * Every 6-prefixed range is assigned to mobiles, so a 6 is always valid;
 * checked across three thousand clock-derived tails, of which 40% were invalid
 * behind a 7 and none behind a 6.
 *
 * The strict metadata is correct and worth keeping: a customer cannot own a
 * +34 79… number, so accepting one would only put an undialable contact in the
 * CRM.
 */
export function spanishMobile(seed: number = Date.now()): string {
  return `+34 6${String(seed).slice(-8)}`;
}

/** The digits only, as the WhatsApp webhook would report them. */
export function digitsOf(phone: string): string {
  return phone.replace(/\D/g, '');
}
