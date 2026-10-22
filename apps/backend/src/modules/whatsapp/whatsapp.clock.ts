/** Injectable time source for owner verification and connection recovery. */
export const WHATSAPP_CLOCK = Symbol('WHATSAPP_CLOCK');

export type Clock = () => Date;
