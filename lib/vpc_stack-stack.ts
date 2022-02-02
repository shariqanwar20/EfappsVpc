import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { allRouteTableIds } from "./util";

export class VpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "ControlTowerVpc", {
      cidr: "10.0.0.0/16",
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: `${this.environment}-PublicSubnet`,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: `${this.environment}-PrivateSubnet`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        },
        {
          cidrMask: 24,
          name: `${this.environment}-ServicesSubnet`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        }
      ],
    })

    // S3 endpoint 
    new ec2.CfnVPCEndpoint(this, "S3VpcEndpoint", {
      vpcId: vpc.vpcId,
      serviceName: `com.amazonaws.${this.region}.s3`,
      routeTableIds: allRouteTableIds([...vpc.publicSubnets, ...vpc.privateSubnets]),
    })

    //Dynamo Endpoint
    new ec2.CfnVPCEndpoint(this, "DynamoVpcEndpoint", {
      vpcId: vpc.vpcId,
      serviceName: `com.amazonaws.${this.region}.dynamodb`,
      routeTableIds: allRouteTableIds([...vpc.publicSubnets, ...vpc.privateSubnets]),
    })

    const sgBastion = new ec2.SecurityGroup(this, "SecurityGroupBastion", {
      vpc,
      allowAllOutbound: false
    })
    sgBastion.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(65535))
    sgBastion.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(65535))
    sgBastion.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp())
    cdk.Tags.of(sgBastion).add("Name", `${this.environment}-sg-bastion`);

    const sgPostgress = new ec2.SecurityGroup(this, "SecurityGroupPostgres", {
      vpc,
      allowAllOutbound: false
    })
    sgPostgress.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(65535))
    sgPostgress.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(65535))
    sgPostgress.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp())
    sgPostgress.addIngressRule(sgBastion, ec2.Port.tcp(5432), "SecurityGroupPostgresBastionIngress")
    cdk.Tags.of(sgPostgress).add("Name", `${this.environment}-sg-postgress`);
    
    const sgRedis = new ec2.SecurityGroup(this, "SecurityGroupRedis", {
      vpc,
      allowAllOutbound: false
    })
    sgRedis.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(65535))
    sgRedis.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(65535))
    sgRedis.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp())
    sgRedis.addIngressRule(sgBastion, ec2.Port.tcp(6379), "SecurityGroupRedisBastionIngress")
    cdk.Tags.of(sgRedis).add("Name", `${this.environment}-sg-redis`);

    const sgMemcache = new ec2.SecurityGroup(this, "SecurityGroupMemcache", {
      vpc,
      allowAllOutbound: false
    })
    sgMemcache.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(65535))
    sgMemcache.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(65535))
    sgMemcache.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp())
    sgMemcache.addIngressRule(sgBastion, ec2.Port.tcp(11211), "SecurityGroupMemcacheBastionIngress")
    cdk.Tags.of(sgMemcache).add("Name", `${this.environment}-sg-memcache`);

    const sgKubeWorker = new ec2.SecurityGroup(this, "SecurityGroupKubeWorker", {
      vpc,
      allowAllOutbound: false
    })
    sgPostgress.addIngressRule(sgKubeWorker, ec2.Port.tcp(5432), "SecurityGroupPostgresKubeWorkerIngress")
    sgRedis.addIngressRule(sgKubeWorker, ec2.Port.tcp(6379), "SecurityGroupRedisKubeWorkerIngress")
    sgMemcache.addIngressRule(sgKubeWorker, ec2.Port.tcp(11211), "SecurityGroupMemcacheKubeWorkerIngress")

    const sgDeisElb = new ec2.SecurityGroup(this, "SecurityGroupDeisElb", {
      vpc,
      allowAllOutbound: false
    })
    sgDeisElb.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))
    sgDeisElb.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443))
    sgDeisElb.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2222))
    sgDeisElb.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.icmpTypeAndCode(3, 4))
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(8080), "SecurityGroupDeisElbHttpEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(6443), "SecurityGroupDeisElbHttpsEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(6443), "SecurityGroupDeisElbHttpsEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(9090), "SecurityGroupDeisElbHealthcheckEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(2222), "SecurityGroupDeisElbGitEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(30080), "SecurityGroupDeisElbNginxHttpEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(30443), "SecurityGroupDeisElbNginxHttpsEgress")
    sgDeisElb.addEgressRule(sgKubeWorker, ec2.Port.tcp(30254), "SecurityGroupDeisElbNginxHealthEgress")

    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(8080), "SecurityGroupDeisElbHttpIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(6443), "SecurityGroupDeisElbHttpsIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(6443), "SecurityGroupDeisElbHttpsIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(9090), "SecurityGroupDeisElbHealthcheckIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(2222), "SecurityGroupDeisElbGitIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(30080), "SecurityGroupDeisElbNginxHttpIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(30443), "SecurityGroupDeisElbNginxHttpsIngress")
    sgKubeWorker.addIngressRule(sgDeisElb, ec2.Port.tcp(30254), "SecurityGroupDeisElbNginxHealthIngress")

    cdk.Tags.of(sgDeisElb).add("Name", `${this.environment}-sg-deisElb`);

    const sgKubeCluster = new ec2.SecurityGroup(this, "SecurityGroupKubeCluster", {
      vpc,
      allowAllOutbound: false
    })
    sgKubeCluster.addIngressRule(sgBastion, ec2.Port.tcpRange(0, 65535), "SecurityGroupKubeClusterBastionIngress")

    cdk.Tags.of(sgKubeCluster).add("Name", `${this.environment}-sg-kube-cluster`);

    const sgElasticSearch = new ec2.SecurityGroup(this, "SecurityGroupElasticSearch", {
      vpc,
      allowAllOutbound: false
    })
    sgElasticSearch.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(65535))
    sgElasticSearch.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(65535))
    sgElasticSearch.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp())
    sgElasticSearch.addIngressRule(ec2.Peer.ipv4("10.0.0.0/16"), ec2.Port.tcp(443))
    cdk.Tags.of(sgElasticSearch).add("Name", `${this.environment}-sg-elasticsearch`);

    new cdk.CfnOutput(this, "vpc", {
      value: vpc.vpcId
    })
    new cdk.CfnOutput(this, "internetGateway", {
      value: vpc.internetGatewayId!
    })
    vpc.publicSubnets.forEach((publicSubnet, i) => {
      new cdk.CfnOutput(this, `PublicSubnet${i + 1}${String.fromCharCode(97 + i)}RouteTable`, {
        value: publicSubnet.routeTable.routeTableId
      })
      new cdk.CfnOutput(this, `PublicSubnet${i + 1}${String.fromCharCode(97 + i)}`, {
        value: publicSubnet.subnetId
      })
    })
    vpc.privateSubnets.forEach((privateSubnet, i) => {
      new cdk.CfnOutput(this, `PrivateSubnet${i + 1}${String.fromCharCode(97 + i)}`, {
        value: privateSubnet.subnetId
      })
    })
    new cdk.CfnOutput(this, `SecurityGroupBastionOutput`, {
      value: sgBastion.securityGroupId
    })
    new cdk.CfnOutput(this, `SecurityGroupPostgresOutput`, {
      value: sgPostgress.securityGroupId
    })
    new cdk.CfnOutput(this, `SecurityGroupRedisOutput`, {
      value: sgRedis.securityGroupId
    })
    new cdk.CfnOutput(this, `SecurityGroupMemcacheOutput`, {
      value: sgMemcache.securityGroupId
    })
  }
}
