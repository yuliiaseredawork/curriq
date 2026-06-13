import { Amplify } from 'aws-amplify';

let configured = false;

export function configureAuth() {
  if (configured) return;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
        userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID!,
      },
    },
  });

  configured = true;
}