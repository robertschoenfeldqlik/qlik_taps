import { useState } from 'react';
import { Layers, CheckSquare, Square, RefreshCw, Database } from 'lucide-react';

/**
 * Pre-defined D365 F&O streams with metadata from the tap's streams.py.
 * These are organized by business domain for easy browsing.
 */
const D365_STREAM_CATALOG = {
  'Reference / Master Data': [
    { name: 'legal_entities',  entity: 'LegalEntities',       replication: 'FULL_TABLE',   description: 'Companies / legal entities' },
    { name: 'customer_groups', entity: 'CustomerGroups',       replication: 'FULL_TABLE',   description: 'Customer groupings' },
    { name: 'vendor_groups',   entity: 'VendorGroups',         replication: 'FULL_TABLE',   description: 'Vendor groupings' },
    { name: 'main_accounts',   entity: 'MainAccounts',         replication: 'FULL_TABLE',   description: 'Chart of accounts' },
  ],
  'Customers & Vendors': [
    { name: 'customers', entity: 'CustomersV3', replication: 'FULL_TABLE', description: 'Customer master records' },
    { name: 'vendors',   entity: 'VendorsV2',   replication: 'FULL_TABLE', description: 'Vendor master records' },
  ],
  'Products & Inventory': [
    { name: 'released_products',    entity: 'ReleasedProductsV2',     replication: 'FULL_TABLE', description: 'Released product items' },
    { name: 'inventory_warehouses', entity: 'InventoryWarehouses',    replication: 'FULL_TABLE', description: 'Warehouse definitions' },
    { name: 'inventory_onhand',     entity: 'InventoryOnhandEntries', replication: 'FULL_TABLE', description: 'On-hand inventory balances' },
  ],
  'Sales Orders': [
    { name: 'sales_order_headers', entity: 'SalesOrderHeadersV2', replication: 'INCREMENTAL', replicationKey: 'ModifiedDateTime', description: 'Sales order headers' },
    { name: 'sales_order_lines',   entity: 'SalesOrderLines',     replication: 'INCREMENTAL', replicationKey: 'ModifiedDateTime', description: 'Sales order line items' },
  ],
  'Purchase Orders': [
    { name: 'purchase_order_headers', entity: 'PurchaseOrderHeadersV2', replication: 'INCREMENTAL', replicationKey: 'ModifiedDateTime', description: 'Purchase order headers' },
    { name: 'purchase_order_lines',   entity: 'PurchaseOrderLines',     replication: 'INCREMENTAL', replicationKey: 'ModifiedDateTime', description: 'Purchase order line items' },
  ],
  'Customer Invoices': [
    { name: 'customer_invoice_headers', entity: 'CustomerInvoiceHeaders', replication: 'INCREMENTAL', replicationKey: 'InvoiceDate',       description: 'AR invoice headers' },
    { name: 'customer_invoice_lines',   entity: 'CustomerInvoiceLines',   replication: 'FULL_TABLE',                                        description: 'AR invoice line items' },
  ],
  'Vendor Invoices': [
    { name: 'vendor_invoice_headers', entity: 'VendorInvoiceHeaders', replication: 'INCREMENTAL', replicationKey: 'ModifiedDateTime', description: 'AP invoice headers' },
    { name: 'vendor_invoice_lines',   entity: 'VendorInvoiceLines',   replication: 'FULL_TABLE',                                      description: 'AP invoice line items' },
  ],
  'General Ledger': [
    { name: 'ledger_journal_headers',           entity: 'LedgerJournalHeaders',          replication: 'FULL_TABLE',                                    description: 'GL journal headers' },
    { name: 'ledger_journal_lines',             entity: 'LedgerJournalLines',            replication: 'FULL_TABLE',                                    description: 'GL journal lines' },
    { name: 'general_journal_entries',          entity: 'GeneralJournalEntries',         replication: 'INCREMENTAL', replicationKey: 'PostingDate', description: 'Posted journal entries' },
    { name: 'general_journal_account_entries',  entity: 'GeneralJournalAccountEntries',  replication: 'INCREMENTAL', replicationKey: 'PostingDate', description: 'Posted account entries' },
  ],
};

const ALL_STREAM_NAMES = Object.values(D365_STREAM_CATALOG).flat().map(s => s.name);

export default function DynamicsStreamsTab({ streams, onChange }) {
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(Object.keys(D365_STREAM_CATALOG))
  );

  // The streams prop is an array of stream name strings for D365
  const selectedSet = new Set(streams || []);

  const toggleStream = (name) => {
    const next = new Set(selectedSet);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onChange([...next]);
  };

  const selectAll = () => {
    onChange([...ALL_STREAM_NAMES]);
  };

  const selectNone = () => {
    onChange([]);
  };

  const toggleGroup = (groupName) => {
    const groupStreams = D365_STREAM_CATALOG[groupName].map(s => s.name);
    const allSelected = groupStreams.every(n => selectedSet.has(n));
    const next = new Set(selectedSet);
    if (allSelected) {
      groupStreams.forEach(n => next.delete(n));
    } else {
      groupStreams.forEach(n => next.add(n));
    }
    onChange([...next]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Layers size={16} />
          {selectedSet.size} of {ALL_STREAM_NAMES.length} streams selected
        </div>
        <div className="flex gap-2">
          <button onClick={selectAll} className="btn-secondary text-xs px-3 py-1.5">
            Select All
          </button>
          <button onClick={selectNone} className="btn-secondary text-xs px-3 py-1.5">
            Select None
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
        Select which D365 OData entity sets to sync. The tap will auto-discover schemas from your environment.
        Incremental streams track changes via a replication key for efficient delta syncs.
      </div>

      {/* Stream groups */}
      <div className="space-y-3">
        {Object.entries(D365_STREAM_CATALOG).map(([groupName, groupStreams]) => {
          const allInGroup = groupStreams.every(s => selectedSet.has(s.name));
          const someInGroup = groupStreams.some(s => selectedSet.has(s.name));

          return (
            <div key={groupName} className="card border border-gray-200">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(groupName)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors rounded-t-lg"
              >
                <div className="flex items-center gap-2">
                  {allInGroup ? (
                    <CheckSquare size={16} className="text-brand-600" />
                  ) : someInGroup ? (
                    <div className="w-4 h-4 border-2 border-brand-400 bg-brand-100 rounded" />
                  ) : (
                    <Square size={16} className="text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-700">{groupName}</span>
                  <span className="text-xs text-gray-400">
                    ({groupStreams.filter(s => selectedSet.has(s.name)).length}/{groupStreams.length})
                  </span>
                </div>
              </button>

              {/* Stream rows */}
              <div className="border-t border-gray-100">
                {groupStreams.map((stream) => {
                  const isSelected = selectedSet.has(stream.name);
                  return (
                    <button
                      key={stream.name}
                      onClick={() => toggleStream(stream.name)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                        isSelected ? 'bg-brand-50/30' : ''
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare size={14} className="text-brand-600 flex-shrink-0" />
                      ) : (
                        <Square size={14} className="text-gray-300 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isSelected ? 'text-gray-800' : 'text-gray-500'}`}>
                            {stream.name}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">{stream.entity}</span>
                        </div>
                        <p className="text-xs text-gray-400">{stream.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {stream.replication === 'INCREMENTAL' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded">
                            <RefreshCw size={10} />
                            Incremental
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                            <Database size={10} />
                            Full Table
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
