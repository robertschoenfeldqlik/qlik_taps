"""Schema discovery for Dynamics 365 Finance & Operations ERP tap.

Builds a Singer Catalog from the pre-defined stream schemas.
"""

import singer
from singer.catalog import Catalog, CatalogEntry
from singer.schema import Schema
from singer import metadata

from tap_dynamics365_erp.streams import STREAMS, load_stream_schema

LOGGER = singer.get_logger()


def discover():
    """Run discovery mode and return a Catalog."""
    entries = []

    for stream_name, stream_config in sorted(STREAMS.items()):
        schema = load_stream_schema(stream_name)
        key_properties = stream_config["key_properties"]
        replication_key = stream_config["replication_key"]
        replication_method = stream_config["replication_method"]

        # Build standard metadata
        valid_replication_keys = [replication_key] if replication_key else []

        mdata = metadata.new()

        # Table-level metadata
        mdata = metadata.write(mdata, (), "table-key-properties", key_properties)
        mdata = metadata.write(mdata, (), "forced-replication-method", replication_method)
        if valid_replication_keys:
            mdata = metadata.write(mdata, (), "valid-replication-keys", valid_replication_keys)

        # Default to selected (so Run Sync picks up all streams)
        mdata = metadata.write(mdata, (), "selected", True)

        # Field-level metadata
        for field_name in schema.get("properties", {}).keys():
            breadcrumb = ("properties", field_name)

            if field_name in key_properties:
                mdata = metadata.write(mdata, breadcrumb, "inclusion", "automatic")
            elif field_name == replication_key:
                mdata = metadata.write(mdata, breadcrumb, "inclusion", "automatic")
            else:
                mdata = metadata.write(mdata, breadcrumb, "inclusion", "available")

        catalog_entry = CatalogEntry(
            tap_stream_id=stream_name,
            stream=stream_name,
            schema=Schema.from_dict(schema),
            key_properties=key_properties,
            metadata=metadata.to_list(mdata),
            replication_key=replication_key,
            replication_method=replication_method,
        )
        entries.append(catalog_entry)

    return Catalog(entries)
