import { ISubnet } from "aws-cdk-lib/aws-ec2";

export function allRouteTableIds(subnets: ISubnet[]): string[] {
    const ret = new Set<string>();
    for (const subnet of subnets) {
      if (subnet.routeTable && subnet.routeTable.routeTableId) {
        ret.add(subnet.routeTable.routeTableId);
      }
    }
    return Array.from(ret);
  }