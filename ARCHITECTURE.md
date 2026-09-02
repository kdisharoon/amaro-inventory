# Amaro Inventory

Monorepo full-stack application using AWS CDK, Vue 3, TypeScript, and DynamoDB.

## Directory Structure
- .github/workflows/ : GitHub Actions deployment pipelines
- bin/ : AWS CDK entry point (app.ts)
- infra/ : CDK Infrastructure stacks (api-stack.ts, site-stack.ts)
- lambda/ : Backend Lambda handlers & DB repository layer
- src/ : Vue 3 Frontend (components, stores, types, api)

## Commands
- npm run dev : Start local Vue dev server
- npx cdk synth : Synthesize CloudFormation templates
- npx cdk deploy --all : Deploy full infrastructure stack
