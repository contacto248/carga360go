import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "./lib/sentry/options";

const options = buildSentryOptions();
if (options) Sentry.init(options as Parameters<typeof Sentry.init>[0]);
