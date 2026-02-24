from setuptools import setup, find_packages

setup(
    name="target-confluent-kafka",
    version="0.1.0",
    description="Singer target that writes records to Confluent Kafka topics",
    author="Qlik Tap Builder",
    py_modules=["target_confluent_kafka"],
    packages=find_packages(),
    install_requires=[
        "confluent-kafka>=2.3.0",
        "singer-python>=6.0.0",
    ],
    entry_points={
        "console_scripts": [
            "target-confluent-kafka=target_confluent_kafka:main",
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
    ],
    python_requires=">=3.8",
)
