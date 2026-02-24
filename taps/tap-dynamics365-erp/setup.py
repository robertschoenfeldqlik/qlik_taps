#!/usr/bin/env python3
from setuptools import setup, find_packages

setup(
    name="tap-dynamics365-erp",
    version="0.1.0",
    description="Singer.io tap for Microsoft Dynamics 365 Finance & Operations (ERP) OData API",
    author="Singer Community",
    url="https://github.com/singer-io/tap-dynamics365-erp",
    classifiers=["Programming Language :: Python :: 3 :: Only"],
    py_modules=["tap_dynamics365_erp"],
    install_requires=[
        "singer-python==6.0.1",
        "requests==2.31.0",
        "backoff==2.2.1",
        "python-dateutil==2.8.2",
    ],
    extras_require={
        "dev": [
            "pytest",
            "pylint",
        ]
    },
    entry_points={
        "console_scripts": [
            "tap-dynamics365-erp=tap_dynamics365_erp:main",
        ]
    },
    packages=find_packages(exclude=["tests"]),
    package_data={"tap_dynamics365_erp": ["schemas/*.json"]},
    include_package_data=True,
    python_requires=">=3.8",
)
