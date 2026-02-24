"""Stream definitions for Dynamics 365 Finance & Operations ERP.

Each stream maps to an OData entity set in D365 F&O. Only the most
important business objects are included:

  - LegalEntities (companies)
  - CustomersV3 / CustomerGroups
  - VendorsV2 / VendorGroups
  - ReleasedProductsV2
  - SalesOrderHeadersV2 / SalesOrderLines
  - PurchaseOrderHeadersV2 / PurchaseOrderLines
  - CustomerInvoiceHeaders / CustomerInvoiceLines
  - VendorInvoiceHeaders / VendorInvoiceLines
  - MainAccounts (chart of accounts)
  - LedgerJournalHeaders / LedgerJournalLines
  - GeneralJournalEntries / GeneralJournalAccountEntries
  - InventoryOnhandEntries / InventoryWarehouses
"""

import os
import json

import singer

LOGGER = singer.get_logger()
SCHEMAS_DIR = os.path.join(os.path.dirname(__file__), "schemas")


def _load_schema(stream_name):
    """Load a JSON schema file from the schemas directory."""
    path = os.path.join(SCHEMAS_DIR, f"{stream_name}.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# --------------------------------------------------------------------------
# Stream definitions
#
# Each entry:
#   entity_set_name  - exact OData EntitySet name (case-sensitive)
#   key_properties   - primary key field(s)
#   replication_key  - field used for incremental bookmarks (None = full table)
#   replication_method - INCREMENTAL or FULL_TABLE
#   cross_company    - whether to add ?cross-company=true
# --------------------------------------------------------------------------

STREAMS = {
    # ---- Reference / Master Data ----
    "legal_entities": {
        "entity_set_name": "LegalEntities",
        "key_properties": ["DataArea"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "customer_groups": {
        "entity_set_name": "CustomerGroups",
        "key_properties": ["CustomerGroupId", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "vendor_groups": {
        "entity_set_name": "VendorGroups",
        "key_properties": ["VendorGroupId", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "main_accounts": {
        "entity_set_name": "MainAccounts",
        "key_properties": ["MainAccountId", "ChartOfAccounts"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },

    # ---- Customers & Vendors ----
    "customers": {
        "entity_set_name": "CustomersV3",
        "key_properties": ["CustomerAccount", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "vendors": {
        "entity_set_name": "VendorsV2",
        "key_properties": ["VendorAccountNumber", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },

    # ---- Products & Inventory ----
    "released_products": {
        "entity_set_name": "ReleasedProductsV2",
        "key_properties": ["ItemNumber", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "inventory_warehouses": {
        "entity_set_name": "InventoryWarehouses",
        "key_properties": ["WarehouseId", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "inventory_onhand": {
        "entity_set_name": "InventoryOnhandEntries",
        "key_properties": ["ItemNumber", "dataAreaId", "InventorySiteId", "WarehouseId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },

    # ---- Sales Orders ----
    "sales_order_headers": {
        "entity_set_name": "SalesOrderHeadersV2",
        "key_properties": ["SalesOrderNumber", "dataAreaId"],
        "replication_key": "ModifiedDateTime",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },
    "sales_order_lines": {
        "entity_set_name": "SalesOrderLines",
        "key_properties": ["SalesOrderNumber", "SalesOrderLineNumber", "dataAreaId"],
        "replication_key": "ModifiedDateTime",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },

    # ---- Purchase Orders ----
    "purchase_order_headers": {
        "entity_set_name": "PurchaseOrderHeadersV2",
        "key_properties": ["PurchaseOrderNumber", "dataAreaId"],
        "replication_key": "ModifiedDateTime",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },
    "purchase_order_lines": {
        "entity_set_name": "PurchaseOrderLines",
        "key_properties": ["PurchaseOrderNumber", "PurchaseOrderLineNumber", "dataAreaId"],
        "replication_key": "ModifiedDateTime",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },

    # ---- Customer Invoices ----
    "customer_invoice_headers": {
        "entity_set_name": "CustomerInvoiceHeaders",
        "key_properties": ["InvoiceId", "dataAreaId"],
        "replication_key": "InvoiceDate",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },
    "customer_invoice_lines": {
        "entity_set_name": "CustomerInvoiceLines",
        "key_properties": ["InvoiceId", "InvoiceLineNumber", "dataAreaId"],
        "replication_key": "InvoiceDate",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },

    # ---- Vendor Invoices ----
    "vendor_invoice_headers": {
        "entity_set_name": "VendorInvoiceHeaders",
        "key_properties": ["HeaderReference", "dataAreaId"],
        "replication_key": "ModifiedDateTime",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },
    "vendor_invoice_lines": {
        "entity_set_name": "VendorInvoiceLines",
        "key_properties": ["HeaderReference", "InvoiceLineNumber", "dataAreaId"],
        "replication_key": "ModifiedDateTime",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },

    # ---- General Ledger ----
    "ledger_journal_headers": {
        "entity_set_name": "LedgerJournalHeaders",
        "key_properties": ["JournalBatchNumber", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "ledger_journal_lines": {
        "entity_set_name": "LedgerJournalLines",
        "key_properties": ["JournalBatchNumber", "LineNumber", "dataAreaId"],
        "replication_key": None,
        "replication_method": "FULL_TABLE",
        "cross_company": True,
    },
    "general_journal_entries": {
        "entity_set_name": "GeneralJournalEntries",
        "key_properties": ["JournalNumber", "dataAreaId"],
        "replication_key": "PostingDate",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },
    "general_journal_account_entries": {
        "entity_set_name": "GeneralJournalAccountEntries",
        "key_properties": ["GeneralJournalAccountEntryRecId"],
        "replication_key": "PostingDate",
        "replication_method": "INCREMENTAL",
        "cross_company": True,
    },
}


def get_stream_names():
    """Return sorted list of available stream names."""
    return sorted(STREAMS.keys())


def get_stream_config(stream_name):
    """Return stream configuration dict."""
    return STREAMS[stream_name]


def load_stream_schema(stream_name):
    """Load and return the JSON schema for a stream."""
    return _load_schema(stream_name)
