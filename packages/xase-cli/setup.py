from setuptools import setup, find_packages

setup(
    name='xase-cli',
    version='2.0.0',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    install_requires=[
        'requests>=2.31.0',
        'rich>=13.7.0',
        'click>=8.1.7',
        'pydantic>=2.5.0',
        'tenacity>=8.2.3',
        'InquirerPy>=0.3.4',
        'pyyaml>=6.0.1',
    ],
    extras_require={
        'dev': [
            'pytest>=7.4.0',
            'pytest-cov>=4.1.0',
            'black>=23.0.0',
            'flake8>=6.0.0',
            'mypy>=1.5.0',
        ],
    },
    entry_points={
        'console_scripts': [
            'xase-cli=xase_cli.cli:main',
        ],
    },
)
