import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

interface AuthStackProps extends cdk.StackProps {
  stage?: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props: AuthStackProps = {}) {
    super(scope, id, props);

    const stage = props.stage ?? 'dev';
    const domainPrefix = `curriq-${stage}`;

    const prodAppUrl = process.env.PROD_APP_URL;

    // Must match NEXT_PUBLIC_AUTH_REDIRECT_SIGN_IN exactly.
    const callbackUrls = [
      'http://localhost:3000',
      ...(prodAppUrl ? [prodAppUrl] : []),
    ];

    // Must match NEXT_PUBLIC_AUTH_REDIRECT_SIGN_OUT exactly.
    const logoutUrls = [
      'http://localhost:3000/auth',
      ...(prodAppUrl ? [`${prodAppUrl}/auth`] : []),
    ];

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
      userPool: this.userPool,
      clientId: process.env.GOOGLE_CLIENT_ID ?? 'PLACEHOLDER',
      clientSecretValue: cdk.SecretValue.unsafePlainText(
        process.env.GOOGLE_CLIENT_SECRET ?? 'PLACEHOLDER',
      ),
      scopes: ['email', 'profile', 'openid'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        fullname: cognito.ProviderAttribute.GOOGLE_NAME,
      },
    });

    // CDK generates attributes_url pointing to the Google People API with an empty
    // personFields parameter. When Cognito calls that URL during the token exchange,
    // Google returns a 400 which causes Cognito's /oauth2/token response to hang.
    // Disabling attributes_url_add_attributes tells Cognito to use only the OIDC
    // claims from the Google ID token (email, name) — no People API call needed.
    (googleProvider.node.defaultChild as cognito.CfnUserPoolIdentityProvider)
      .addOverride('Properties.ProviderDetails.attributes_url_add_attributes', 'false');

    const domain = this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix,
      },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    this.userPoolClient.node.addDependency(googleProvider);

    this.cognitoDomain = `${domainPrefix}.auth.${this.region}.amazoncognito.com`;

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: this.cognitoDomain,
    });
  }
}
