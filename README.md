# Steps to follow

1. add account number and region in bin/vpc_stack.ts file
2. run (npm run build)
3. run cdk deploy --profile SCCDK
3. The resources being created is similar to the yaml file provided (You can compare your json cloudformation file with cdk.out/VpcStackStack.template.json)