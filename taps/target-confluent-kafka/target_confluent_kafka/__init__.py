"""Singer target for Confluent Kafka.

Reads Singer-formatted messages from stdin and produces records
to Kafka topics. Each stream is mapped to a Kafka topic using the
pattern: {topic_prefix}{stream_name}

Configuration:
  bootstrap_servers  - Kafka broker(s), e.g. "kafka:9092" (required)
  topic_prefix       - Prefix for topic names, default "singer-"
  flush_interval     - Flush after N records, default 1000
  delivery_timeout   - Delivery timeout in ms, default 30000
  compression_type   - Compression: none, gzip, snappy, lz4, zstd (default: gzip)
  security_protocol  - PLAINTEXT, SSL, SASL_PLAINTEXT, SASL_SSL (default: PLAINTEXT)
  sasl_mechanism     - PLAIN, SCRAM-SHA-256, SCRAM-SHA-512
  sasl_username      - SASL username
  sasl_password      - SASL password
  schema_registry_url - Confluent Schema Registry URL (optional)
  auto_create_topics - Auto-create topics if they don't exist (default: true)
  key_field          - Record field to use as Kafka message key (optional)
  include_metadata   - Include _sdc metadata fields (default: false)
"""

import io
import json
import sys
import time
import argparse

import singer

LOGGER = singer.get_logger()

REQUIRED_CONFIG_KEYS = ["bootstrap_servers"]

DEFAULT_CONFIG = {
    "topic_prefix": "singer-",
    "flush_interval": 1000,
    "delivery_timeout": 30000,
    "compression_type": "gzip",
    "security_protocol": "PLAINTEXT",
    "auto_create_topics": True,
    "include_metadata": False,
}


class KafkaTarget:
    """Singer target that produces records to Kafka."""

    def __init__(self, config):
        self.config = {**DEFAULT_CONFIG, **config}
        self.topic_prefix = self.config["topic_prefix"]
        self.flush_interval = self.config["flush_interval"]
        self.key_field = self.config.get("key_field")
        self.include_metadata = self.config.get("include_metadata", False)

        self.schemas = {}
        self.key_properties = {}
        self.record_count = 0
        self.state = None
        self.producer = None

    def _get_producer(self):
        """Lazy-initialize the Kafka producer."""
        if self.producer is not None:
            return self.producer

        try:
            from confluent_kafka import Producer
        except ImportError:
            LOGGER.error(
                "confluent-kafka package not installed. "
                "Install with: pip install confluent-kafka"
            )
            raise

        producer_config = {
            "bootstrap.servers": self.config["bootstrap_servers"],
            "delivery.timeout.ms": self.config["delivery_timeout"],
            "compression.type": self.config["compression_type"],
            "linger.ms": 50,
            "batch.num.messages": 500,
        }

        # Security settings
        security = self.config.get("security_protocol", "PLAINTEXT")
        if security != "PLAINTEXT":
            producer_config["security.protocol"] = security

        if self.config.get("sasl_mechanism"):
            producer_config["sasl.mechanism"] = self.config["sasl_mechanism"]
        if self.config.get("sasl_username"):
            producer_config["sasl.username"] = self.config["sasl_username"]
        if self.config.get("sasl_password"):
            producer_config["sasl.password"] = self.config["sasl_password"]

        LOGGER.info(
            "Connecting to Kafka at %s",
            self.config["bootstrap_servers"],
        )
        self.producer = Producer(producer_config)
        return self.producer

    def _delivery_callback(self, err, msg):
        """Callback for Kafka delivery reports."""
        if err:
            LOGGER.error("Delivery failed for topic %s: %s", msg.topic(), err)
        # else: delivery succeeded, no logging needed for performance

    def _topic_name(self, stream_name):
        """Build topic name from stream name."""
        return f"{self.topic_prefix}{stream_name}"

    def process_schema(self, message):
        """Handle a SCHEMA message."""
        stream = message["stream"]
        self.schemas[stream] = message.get("schema", {})
        self.key_properties[stream] = message.get("key_properties", [])
        LOGGER.info(
            "Schema received for stream '%s' (keys: %s)",
            stream,
            self.key_properties[stream],
        )

    def process_record(self, message):
        """Handle a RECORD message — produce to Kafka."""
        stream = message["stream"]
        record = message["record"]

        if not self.include_metadata:
            # Strip Singer metadata fields
            record = {
                k: v for k, v in record.items() if not k.startswith("_sdc_")
            }

        topic = self._topic_name(stream)

        # Build message key from key_properties or key_field
        key = None
        key_props = self.key_properties.get(stream, [])
        if self.key_field and self.key_field in record:
            key = str(record[self.key_field])
        elif key_props:
            key_parts = [str(record.get(k, "")) for k in key_props]
            key = "|".join(key_parts)

        producer = self._get_producer()
        try:
            producer.produce(
                topic=topic,
                key=key.encode("utf-8") if key else None,
                value=json.dumps(record).encode("utf-8"),
                callback=self._delivery_callback,
            )
        except BufferError:
            # Local queue is full, flush and retry
            LOGGER.warning("Producer buffer full, flushing...")
            producer.flush(timeout=10)
            producer.produce(
                topic=topic,
                key=key.encode("utf-8") if key else None,
                value=json.dumps(record).encode("utf-8"),
                callback=self._delivery_callback,
            )

        self.record_count += 1

        # Periodic flush and poll
        if self.record_count % self.flush_interval == 0:
            producer.flush(timeout=10)
            LOGGER.info(
                "Flushed %d records to Kafka", self.record_count
            )
        elif self.record_count % 100 == 0:
            producer.poll(0)  # trigger delivery callbacks without blocking

    def process_state(self, message):
        """Handle a STATE message."""
        self.state = message.get("value", message)

        # Flush pending records before emitting state
        if self.producer:
            self.producer.flush(timeout=10)

        # Emit state to stdout for the tap framework
        singer.write_state(self.state)

    def run(self, input_stream=None):
        """Main processing loop — read Singer messages from stdin."""
        input_stream = input_stream or io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

        LOGGER.info(
            "Starting target-confluent-kafka (brokers: %s, prefix: '%s')",
            self.config["bootstrap_servers"],
            self.topic_prefix,
        )

        start_time = time.time()

        for line in input_stream:
            line = line.strip()
            if not line:
                continue

            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                LOGGER.warning("Skipping non-JSON line: %s", line[:200])
                continue

            msg_type = message.get("type", "").upper()

            if msg_type == "SCHEMA":
                self.process_schema(message)
            elif msg_type == "RECORD":
                self.process_record(message)
            elif msg_type == "STATE":
                self.process_state(message)
            elif msg_type == "ACTIVATE_VERSION":
                pass  # Not used by this target
            else:
                LOGGER.warning("Unknown message type: %s", msg_type)

        # Final flush
        if self.producer:
            LOGGER.info("Final flush — %d total records", self.record_count)
            self.producer.flush(timeout=30)

        elapsed = time.time() - start_time
        LOGGER.info(
            "target-confluent-kafka complete: %d records in %.1f seconds (%.0f records/sec)",
            self.record_count,
            elapsed,
            self.record_count / elapsed if elapsed > 0 else 0,
        )

        # Emit final state
        if self.state:
            singer.write_state(self.state)


def main():
    """Entry point for target-confluent-kafka."""
    parser = argparse.ArgumentParser(
        description="Singer target for Confluent Kafka"
    )
    parser.add_argument(
        "-c", "--config",
        required=True,
        help="Path to configuration JSON file",
    )
    args = parser.parse_args()

    with open(args.config, "r") as f:
        config = json.load(f)

    # Validate required keys
    missing = [k for k in REQUIRED_CONFIG_KEYS if not config.get(k)]
    if missing:
        LOGGER.error("Missing required config key(s): %s", ", ".join(missing))
        sys.exit(1)

    target = KafkaTarget(config)
    target.run()


if __name__ == "__main__":
    main()
