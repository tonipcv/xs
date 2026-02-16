from setuptools import setup, find_packages
from pathlib import Path

readme_path = Path(__file__).parent / "README.md"
long_description = readme_path.read_text(encoding="utf-8") if readme_path.exists() else "Xase AI Lab CLI"

setup(
    name='xase-ai',
    version='2.0.2',
    description='Enterprise-grade CLI for the Xase AI Lab (governed AI training datasets)',
    long_description=long_description,
    long_description_content_type='text/markdown',
    author='Xase AI Labs',
    url='https://github.com/xaseai/xase-sheets',
    license='MIT',
    python_requires='>=3.8',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    include_package_data=True,
    install_requires=[
        'requests>=2.31.0',
        'rich>=13.7.0',
        'click>=8.1.7',
        'pydantic>=2.5.0',
        'pydantic-settings>=2.2.0',
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
            'build>=1.2.1',
            'twine>=5.0.0',
        ],
    },
    classifiers=[
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3 :: Only',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'License :: OSI Approved :: MIT License',
        'Environment :: Console',
        'Intended Audience :: Developers',
        'Topic :: Software Development :: Build Tools',
        'Topic :: Utilities',
    ],
    entry_points={
        'console_scripts': [
            'xase-cli=xase_cli.cli:main',
        ],
    },
)
