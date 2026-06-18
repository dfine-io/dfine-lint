// no-secrets — hardcoded vendor credentials in string literals.
// All credential-shaped strings below are SYNTHETIC, non-functional DUMMY values — not real secrets.

// POSITIVE: AWS access key id
export const awsKey = "AKIAEXAMPLEDUMMYKEY0"; // EXPECT: no-secrets

// POSITIVE: GitHub personal access token
export const ghToken = "ghp_EXAMPLEDUMMYTOKENdonotuse00000000000"; // EXPECT: no-secrets

// POSITIVE: Stripe live secret key
export const stripe = "sk_live_EXAMPLEDUMMYKEYdonotuse0"; // EXPECT: no-secrets

// POSITIVE: Google API key
export const gkey = "AIzaEXAMPLEDUMMYKEYdonotuse000000000000"; // EXPECT: no-secrets

// POSITIVE: PEM private key header (no-substitution template literal)
export const pem = `-----BEGIN RSA PRIVATE KEY-----`; // EXPECT: no-secrets

// NEGATIVE: AWS documented example key is denylisted
export const example = "AKIAIOSFODNN7EXAMPLE";

// POSITIVE: a Stripe TEST key is also a credential (imported gitleaks pattern flags it)
export const testKey = "sk_test_EXAMPLEDUMMYKEYdonotuse0"; // EXPECT: no-secrets

// NEGATIVE: an ordinary string
export const greeting = "hello world — this is clearly not a secret value";

// NEGATIVE: a short, non-matching token-shaped string
export const partial = "ghp_short";
