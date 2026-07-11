import { SetMetadata } from '@nestjs/common';
import { RAW_RESPONSE_KEY } from '../constants/auth.constants';

/** Marks a route's response as exempt from the global `{ success, message, data }` envelope. */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
