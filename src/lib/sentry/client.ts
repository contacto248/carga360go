import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "./options";

const options = buildSentryOptions();
if (options) Sentry.init(options as Parameters<typeof Sentry.init>[0]);
