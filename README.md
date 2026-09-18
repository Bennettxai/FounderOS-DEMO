# Startup

AI-operated investment and personal portfolio management company.

This repository is being rebuilt from the FounderOS codebase into a governed multi-agent investment company operating system.

## Current status

**Foundation Mode**

The current company model contains:

- 3 departments
- 19 planned AI employees
- human CEO final authority
- no fabricated production history
- no autonomous brokerage execution

## Company

### Research Investments

Researches macroeconomics, markets, equities, crypto and ETFs and performs critical review of investment theses.

### Risk Analysis

Transforms approved research proposals into structured risk analysis and execution proposals.

### Portfolio Monitoring & Performance

Monitors positions, exposures, performance, employee quality and organizational learning.

## Architecture

FounderOS currently provides parts of the original application chassis.

The target architecture adds:

- deterministic Company Control Plane
- Startup Brain powered by Cognee
- external web and financial-data research
- governed approval workflows
- PostgreSQL operational state
- artifact storage
- observability and audit history

Core principle:

> Agents propose actions. The Control Plane determines whether they are technically permitted.

The human CEO makes final investment and execution decisions.

## Startup Brain

Startup Brain is the institutional memory of the company.

It stores reasoning summaries, facts, assumptions, decisions, outcomes, errors, corrections and validated lessons.

It does not store raw historical market time series.

## Canonical specification

The company model is defined in:

- `company/company.yaml`
- `company/organization.yaml`
- `company/governance.yaml`
- `policies/memory_policy.yaml`

## Development

```bash
npm install
npm run dev
npm run typecheck
npm test

Windows PowerShell users may need npm.cmd.

Development currently takes place on:

foundation/company-spec-v1
Current application surfaces
Home
Agents
Tasks
Skills
Org Chart
Startup Brain
Workflows
Connections
Analytics

The project is intentionally kept in a clean foundation state while production infrastructure is introduced progressively.