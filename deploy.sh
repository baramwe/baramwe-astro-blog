#!/bin/sh -x
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run build && npx wrangler deploy