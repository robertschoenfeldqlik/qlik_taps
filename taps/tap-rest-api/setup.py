#!/usr/bin/env python3
from setuptools import setup, find_packages

setup(
    name="tap-rest-api",
    version="1.0.0",
    description="Singer.io tap for any REST API endpoint with automatic schema inference, denesting, and flexible authentication (API key, Bearer, Basic, OAuth2)",
    author="Singer Community",
    url="https://github.com/singer-io/tap-rest-api",
    classifiers=["Programming Language :: Python :: 3 :: Only"],
    py_modules=["tap_rest_api"],
    install_requires=[
        "singer-python==6.0.1",
        "requests==2.31.0",
        "backoff==2.2.1",
        "python-dateutil==2.8.2",
        "requests-oauthlib==1.3.1",
        "jsonpath-ng==1.6.1",
    ],
    extras_require={
        "dev": [
            "pytest",
            "pylint",
            "responses",
        ]
    },
    entry_points={
        "console_scripts": [
            "tap-rest-api=tap_rest_api:main",
        ]
    },
    packages=find_packages(exclude=["tests"]),
    package_data={"tap_rest_api": ["schemas/*.json"]},
    include_package_data=True,
    python_requires=">=3.8",
)
