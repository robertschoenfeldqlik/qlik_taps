"""Singer tap for Microsoft Dynamics 365 Finance & Operations (ERP).

Extracts data from the D365 F&O OData v4 API using OAuth 2.0
client credentials authentication.

Supported streams:
  - legal_entities, customer_groups, vendor_groups, main_accounts
  - customers, vendors
  - released_products, inventory_warehouses, inventory_onhand
  - sales_order_headers, sales_order_lines
  - purchase_order_headers, purchase_order_lines
  - customer_invoice_headers, customer_invoice_lines
  - vendor_invoice_headers, vendor_invoice_lines
  - ledger_journal_headers, ledger_journal_lines
  - general_journal_entries, general_journal_account_entries
"""

import json
import sys

import singer
from singer import utils

from tap_dynamics365_erp.discover import discover
from tap_dynamics365_erp.sync import sync

REQUIRED_CONFIG_KEYS = [
    "environment_url",   # e.g. https://mycompany.operations.dynamics.com
    "tenant_id",         # Azure AD tenant ID
    "client_id",         # App registration client ID
    "client_secret",     # App registration secret
]

LOGGER = singer.get_logger()


@utils.handle_top_exception(LOGGER)
def main():
    """Entry point for tap-dynamics365-erp."""
    args = utils.parse_args(REQUIRED_CONFIG_KEYS)

    if args.discover:
        catalog = discover()
        json.dump(catalog.to_dict(), sys.stdout, indent=2)
        LOGGER.info("Discovery complete. %d streams found.", len(catalog.streams))
    else:
        state = args.state or {}
        if args.catalog:
            catalog = args.catalog
        else:
            catalog = discover()

        sync(args.config, state, catalog)


if __name__ == "__main__":
    main()
