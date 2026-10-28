import base64
import unittest

from rules import Rules, decide, host_matches

GH = "dc-GH_TOKEN-0123456789abcdef"
ACME = "dc-ACME_KEY-fedcba9876543210"


def rules(policy="open", allow=()):
    return Rules.from_json(
        {
            "policy": policy,
            "allow": list(allow),
            "secrets": [
                {"name": "GH_TOKEN", "placeholder": GH, "hosts": ["api.github.com", "github.com"]},
                {"name": "ACME_KEY", "placeholder": ACME, "hosts": ["*.acme.dev:8443"]},
            ],
        },
        {"DEV_CONTAINER_SECRET_GH_TOKEN": "ghp_real", "DEV_CONTAINER_SECRET_ACME_KEY": "acme_real"},
    )


def basic(user, password):
    return "Basic " + base64.b64encode(("%s:%s" % (user, password)).encode()).decode()


def request(host, headers, scheme="https", port=443, url=None, policy="open", allow=()):
    return decide(rules(policy, allow), scheme, host, port, url or "%s://%s/" % (scheme, host), headers)


class HostMatching(unittest.TestCase):
    def test_exact_and_wildcard(self):
        self.assertTrue(host_matches("github.com", "github.com", 443))
        self.assertFalse(host_matches("github.com", "api.github.com", 443))
        self.assertTrue(host_matches("*.acme.dev", "api.acme.dev", 443))
        self.assertFalse(host_matches("*.acme.dev", "acme.dev", 443))
        self.assertFalse(host_matches("*.acme.dev", "evilacme.dev", 443))

    def test_port(self):
        self.assertTrue(host_matches("x.dev:8443", "x.dev", 8443))
        self.assertFalse(host_matches("x.dev:8443", "x.dev", 443))


class Injection(unittest.TestCase):
    def test_swaps_bearer_for_bound_host(self):
        d = request("api.github.com", [("Authorization", "Bearer " + GH), ("Accept", "*/*")])
        self.assertEqual(d.blocked, "")
        self.assertEqual(d.headers, [("Authorization", "Bearer ghp_real"), ("Accept", "*/*")])
        self.assertEqual(d.injected, ["GH_TOKEN"])

    def test_swaps_inside_basic_auth(self):
        d = request("github.com", [("Authorization", basic("x-access-token", GH))])
        self.assertEqual(d.headers, [("Authorization", basic("x-access-token", "ghp_real"))])

    def test_any_header_name(self):
        d = request("api.acme.dev", [("x-api-key", ACME)], port=8443)
        self.assertEqual(d.headers, [("x-api-key", "acme_real")])

    def test_untouched_without_placeholders(self):
        d = request("example.com", [("Authorization", "Bearer something")])
        self.assertEqual((d.blocked, d.injected), ("", []))

    def test_host_is_case_and_dot_insensitive(self):
        d = request("API.GitHub.com.", [("Authorization", "Bearer " + GH)])
        self.assertEqual(d.injected, ["GH_TOKEN"])


class Blocking(unittest.TestCase):
    def test_placeholder_to_unbound_host(self):
        d = request("evil.example", [("Authorization", "Bearer " + GH)])
        self.assertIn("not bound", d.blocked)

    def test_placeholder_in_basic_to_unbound_host(self):
        d = request("evil.example", [("Authorization", basic("x", GH))])
        self.assertIn("not bound", d.blocked)

    def test_wrong_port(self):
        d = request("api.acme.dev", [("x-api-key", ACME)], port=443)
        self.assertIn("not bound", d.blocked)

    def test_plain_http(self):
        d = request("api.github.com", [("Authorization", "Bearer " + GH)], scheme="http", port=80)
        self.assertIn("refusing", d.blocked)

    def test_placeholder_in_url(self):
        d = request("api.github.com", [], url="https://api.github.com/?token=" + GH)
        self.assertEqual(d.blocked, "placeholder in URL")

    def test_unknown_placeholder(self):
        d = request("api.github.com", [("Authorization", "Bearer dc-GH_TOKEN-aaaaaaaaaaaaaaaa")])
        self.assertIn("unknown placeholder", d.blocked)

    def test_missing_value(self):
        r = Rules.from_json({"policy": "open", "allow": [], "secrets": [{"name": "X", "placeholder": GH, "hosts": ["x.dev"]}]}, {})
        d = decide(r, "https", "x.dev", 443, "https://x.dev/", [("Authorization", GH)])
        self.assertIn("no value", d.blocked)


class Allowlist(unittest.TestCase):
    def test_blocks_unlisted_hosts(self):
        d = request("example.com", [], policy="allowlist", allow=["registry.npmjs.org"])
        self.assertIn("not on the allowlist", d.blocked)

    def test_allows_listed_and_secret_hosts(self):
        self.assertEqual(request("registry.npmjs.org", [], policy="allowlist", allow=["registry.npmjs.org"]).blocked, "")
        self.assertEqual(request("api.github.com", [], policy="allowlist").blocked, "")

    def test_open_policy_allows_anything(self):
        self.assertEqual(request("example.com", []).blocked, "")


if __name__ == "__main__":
    unittest.main()
