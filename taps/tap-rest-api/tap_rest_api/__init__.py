"""Singer tap for any REST API endpoint.

A generic, configuration-driven Singer tap that connects to any REST API,
automatically infers JSON schemas, denests nested objects/arrays, and
supports flexible authentication methods.

Features:
  - Connect to ANY REST API endpoint via config
  - Automatic JSON schema inference from API responses
  - Denesting of nested objects and arrays into flat tables
  - Multiple auth methods: no_auth, api_key, bearer_token, basic, oauth2
  - Configurable pagination: page, offset, cursor, link_header, jsonpath
  - URL parameter injection and custom headers
  - Incremental replication via bookmark fields
  - JSONPath for extracting records from nested response structures
"""

import json
import sys

import singer
from singer import utils

from tap_rest_api.discover import discover
from tap_rest_api.sync import sync

REQUIRED_CONFIG_KEYS = [
    "api_url",
    "streams",
]

LOGGER = singer.get_logger()


@utils.handle_top_exception(LOGGER)
def main():
    """Entry point for tap-rest-api."""
    args = utils.parse_args(REQUIRED_CONFIG_KEYS)

    if args.discover:
        catalog = discover(args.config)
        json.dump(catalog.to_dict(), sys.stdout, indent=2)
        LOGGER.info("Discovery complete.")
    else:
        state = args.state or {}
        if args.catalog:
            catalog = args.catalog
        else:
            catalog = discover(args.config)

        sync(args.config, state, catalog)


if __name__ == "__main__":
    main()
