const token = "eyJhbGciOiJFUzI1NiIsImtpZCI6IjM3ZDIyNDE4LTU0OWItNDQxZi1hMGJmLTFmZWNmNzc1ODcwNyIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3d5cXNveGt3bXVsaHBjb3Nsbm9qLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0MWExY2ZjNi05MWFlLTRmYzgtYWZkOC01ZGJiYmYzOTIyZWYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzk1MjAxMDMxLCJpYXQiOjE3OTUxOTc0MzEsImVtYWlsIjoic2FoYWJpam95MjAwNjIwMjJAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCIsImdvb2dsZSJdfSwidXNlcl9tZXRhZGF0YSI6eyJhdmF0YXJfdXJsIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSnowRGZKSXZfQVBFVDFJVElJdDJZOXRjVWg1cmYybUFJVng4VUwwc0NjRDZuLUFmY3k9czk2LWMiLCJjb3Zlcl91cmwiOiJodHRwczovL3B1Yi00NDQ5OGZjYjdhNmY0YzRiODNkYTRlNjkzNDU0Yjg5MS5yMi5kZXYvY292ZXJzLzQxYTFjZmM2LTkxYWUtNGZjOC1hZmQ4LTVkYmJiZjM5MjJlZi9jb3Zlcl8xNzk1MTY3MjM1NDU4LmpwZyIsImVtYWlsIjoic2FoYWJpam95MjAwNjIwMjJAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6ImJpam95IHNhaGEiLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYW1lIjoiYmlqb3kgc2FoYSIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0p6MERmSkl2X0FQRVQxSVRJSXQyWTl0Y1VoNXJmMm1BSVZ4OFVMMHNDY0Q2bi1BZmN5PXM5Ni1jIiwicHJvdmlkZXJfaWQiOiIxMDkyNTYzMDYzMDYzMTMzNDIwMDEiLCJzdWIiOiIxMDkyNTYzMDYzMDYzMTMzNDIwMDEifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc5NTE5MzkzMn1dLCJzZXNzaW9uX2lkIjoiNmY2MDNkZDMtM2UxZi00MjdjLWE3OGMtMzk4NDViMmRlZmQ2IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.pAd7IFAoJFQuYdWV9w8sF9xVyfT_34evB9QKxLuulG6N864gJm5S0zcbgY8qio9R1AmsdV1ykfh6HFA9CUXmZA";

async function run() {
  const payload = {
    title: "Binary search tree insertion algorithm question",
    body: "How does AVL tree self-balancing work during insertion with right-left rotation?",
    urgency: "normal",
    target: "campus"
  };

  const res = await fetch("https://ruetskillbridge.duckdns.org/api/v1/help/questions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  console.log("Status:", res.status);
  const data = await res.text();
  console.log("Response body:", data);
}

run();
