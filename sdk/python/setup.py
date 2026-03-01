"""
XASE Python SDK
Official Python SDK for XASE Sheets - Secure Data Marketplace
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding='utf-8')

setup(
    name='xase-ai',
    version='2.1.0',
    description='Official Python SDK for XASE AI - Secure Data Marketplace',
    long_description=long_description,
    long_description_content_type='text/markdown',
    author='XASE AI',
    author_email='support@xase.ai',
    url='https://github.com/xaseai/xase-sheets',
    project_urls={
        'Documentation': 'https://docs.xase.ai',
        'Source': 'https://github.com/xaseai/xase-sheets',
        'Tracker': 'https://github.com/xaseai/xase-sheets/issues',
    },
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    python_requires='>=3.8',
    install_requires=[
        'requests>=2.31.0',
        'websocket-client>=1.6.0',
        'python-dateutil>=2.8.0',
        'typing-extensions>=4.5.0',
    ],
    extras_require={
        'dev': [
            'pytest>=7.4.0',
            'pytest-cov>=4.1.0',
            'pytest-asyncio>=0.21.0',
            'black>=23.7.0',
            'flake8>=6.1.0',
            'mypy>=1.5.0',
            'isort>=5.12.0',
        ],
        'async': [
            'aiohttp>=3.8.0',
        ],
    },
    classifiers=[
        'Development Status :: 5 - Production/Stable',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'Programming Language :: Python :: 3.12',
        'Topic :: Software Development :: Libraries :: Python Modules',
        'Topic :: Scientific/Engineering :: Artificial Intelligence',
        'Topic :: Database',
    ],
    keywords='xase data-marketplace ai-training gdpr compliance data-sharing sdk',
    license='MIT',
    include_package_data=True,
    zip_safe=False,
)
