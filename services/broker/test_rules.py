import base64
import unittest

from rules import Rules, allowed, decide, host_matches, path_matches, request_path

GH = "dc-GITHUB_TOKEN-0123456789abcdef"
ACME = "dc-ACME_KEY-fedcba9876543210"


def rules(policy="open", allow=()):
    return Rules.from_json(
        {
            "policy": policy,
            "allow": list(allow),
            "secrets": [
                {"name": "GITHUB_TOKEN", "placeholder": GH, "hosts": ["api.github.com", "github.com"]},
                {"name": "ACME_KEY", "placeholder": ACME, "hosts": ["*.acme.dev:8443"]},
            ],
        },
        {"DEV_CONTAINER_SECRET_GITHUB_TOKEN": "ghp_real", "DEV_CONTAINER_SECRET_ACME_KEY": "acme_real"},
    )


def basic(user, password):
    return "Basic " + base64.b64encode(("%s:%s" % (user, password)).encode()).decode()


def request(host, headers, scheme="https", port=443, url=None, policy="open", allow=(), method="GET"):
    return decide(rules(policy, allow), scheme, host, port, method, url or "%s://%s/" % (scheme, host), headers)


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
        self.assertIsNone(d.blocked)
        self.assertEqual(d.headers, [("Authorization", "Bearer ghp_real"), ("Accept", "*/*")])
        self.assertEqual(d.injected, ["GITHUB_TOKEN"])

    def test_swaps_inside_basic_auth(self):
        d = request("github.com", [("Authorization", basic("x-access-token", GH))])
        self.assertEqual(d.headers, [("Authorization", basic("x-access-token", "ghp_real"))])

    def test_any_header_name(self):
        d = request("api.acme.dev", [("x-api-key", ACME)], port=8443)
        self.assertEqual(d.headers, [("x-api-key", "acme_real")])

    def test_untouched_without_placeholders(self):
        d = request("example.com", [("Authorization", "Bearer something")])
        self.assertEqual((d.blocked, d.injected), (None, []))

    def test_host_is_case_and_dot_insensitive(self):
        d = request("API.GitHub.com.", [("Authorization", "Bearer " + GH)])
        self.assertEqual(d.injected, ["GITHUB_TOKEN"])


class Blocking(unittest.TestCase):
    def test_placeholder_to_unbound_host(self):
        d = request("evil.example", [("Authorization", "Bearer " + GH)])
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5004")

    def test_placeholder_in_basic_to_unbound_host(self):
        d = request("evil.example", [("Authorization", basic("x", GH))])
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5004")

    def test_wrong_port(self):
        d = request("api.acme.dev", [("x-api-key", ACME)], port=443)
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5004")

    def test_plain_http(self):
        d = request("api.github.com", [("Authorization", "Bearer " + GH)], scheme="http", port=80)
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5005")

    def test_placeholder_in_url(self):
        d = request("api.github.com", [], url="https://api.github.com/?token=" + GH)
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5002")

    def test_unknown_placeholder(self):
        d = request("api.github.com", [("Authorization", "Bearer dc-GITHUB_TOKEN-aaaaaaaaaaaaaaaa")])
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5003")

    def test_missing_value(self):
        r = Rules.from_json({"policy": "open", "allow": [], "secrets": [{"name": "X", "placeholder": GH, "hosts": ["x.dev"]}]}, {})
        d = decide(r, "https", "x.dev", 443, "GET", "https://x.dev/", [("Authorization", GH)])
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5006")


class PathMatching(unittest.TestCase):
    def test_single_segment_star(self):
        self.assertTrue(path_matches("/users/*/messages/send", "/users/me/messages/send"))
        self.assertFalse(path_matches("/users/*/messages/send", "/users/a/b/messages/send"))
        self.assertTrue(path_matches("/v1/*.json", "/v1/a.json"))

    def test_double_star_spans_segments_and_its_parent(self):
        self.assertTrue(path_matches("/repos/**", "/repos"))
        self.assertTrue(path_matches("/repos/**", "/repos/a/b/c"))
        self.assertFalse(path_matches("/repos/**", "/reposx"))
        self.assertTrue(path_matches("/a/**/z", "/a/z"))
        self.assertTrue(path_matches("/a/**/z", "/a/b/c/z"))
        self.assertTrue(path_matches("/**", "/"))

    def test_case_insensitive(self):
        self.assertTrue(path_matches("/repos/antfu/**", "/REPOS/Antfu/x"))

    def test_request_path_is_normalized(self):
        self.assertEqual(request_path("https://x.dev//a/./b/../c?q=/d"), "/a/c")
        self.assertEqual(request_path("https://x.dev/a%2Fb/%2e%2e/c"), "/a/c")
        self.assertEqual(request_path("https://x.dev"), "/")


def ruled(rules_, method, url, headers=None):
    r = Rules.from_json(
        {"policy": "open", "allow": [], "secrets": [{"name": "GITHUB_TOKEN", "placeholder": GH, "hosts": ["api.github.com"], "rules": rules_}]},
        {"DEV_CONTAINER_SECRET_GITHUB_TOKEN": "ghp_real"},
    )
    return decide(r, "https", "api.github.com", 443, method, url, [("Authorization", "Bearer " + GH)] if headers is None else headers)


class RequestRules(unittest.TestCase):
    ONLY_ONE_REPO = [
        {"action": "allow", "methods": ["GET"], "path": "/repos/antfu/**"},
        {"action": "allow", "path": "/repos/antfu/dev-container/**"},
        {"action": "deny"},
    ]

    def test_first_match_wins(self):
        self.assertEqual(ruled(self.ONLY_ONE_REPO, "GET", "https://api.github.com/repos/antfu/other").injected, ["GITHUB_TOKEN"])
        self.assertEqual(ruled(self.ONLY_ONE_REPO, "POST", "https://api.github.com/repos/antfu/dev-container/issues").injected, ["GITHUB_TOKEN"])
        d = ruled(self.ONLY_ONE_REPO, "post", "https://api.github.com/repos/antfu/other/issues")
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5007")
        self.assertIn("rule `deny * /**`", d.blocked.why)

    def test_unmatched_requests_are_allowed(self):
        deny_send = [{"action": "deny", "methods": ["POST"], "path": "/users/*/messages/send"}]
        self.assertIsNone(ruled(deny_send, "GET", "https://api.github.com/users/me/messages/send").blocked)
        self.assertIsNone(ruled([], "DELETE", "https://api.github.com/anything").blocked)

    def test_encoded_and_dotted_paths_cannot_slip_past(self):
        deny = [{"action": "deny", "path": "/repos/**"}]
        for url in ("https://api.github.com/x/../repos/a", "https://api.github.com/%72epos/a", "https://api.github.com//repos/a"):
            self.assertEqual(ruled(deny, "GET", url).blocked.code, "DEV_CONTAINER_B5007", url)

    def test_rules_apply_only_when_the_secret_is_sent(self):
        self.assertIsNone(ruled([{"action": "deny"}], "GET", "https://api.github.com/", headers=[]).blocked)


class Rendering(unittest.TestCase):
    def test_reads_like_a_nostics_diagnostic(self):
        d = request("evil.example", [("Authorization", "Bearer " + GH)])
        self.assertEqual(
            d.blocked.render().splitlines(),
            [
                "[DEV_CONTAINER_B5004] GITHUB_TOKEN is not bound to evil.example, so the broker will not send it there.",
                "\u251c\u25b6 fix: Send GITHUB_TOKEN only to api.github.com, github.com. If evil.example truly needs it, ask for the host to be added to that secret's `hosts`. This is configured on the host in dev-container.config.ts; it cannot be changed from inside the container.",
                "\u2570\u25b6 see: https://github.com/antfu/dev-container/blob/main/docs/errors/DEV_CONTAINER_B5004.md",
            ],
        )


class Unbound(unittest.TestCase):
    def test_a_secret_without_hosts_is_never_sent(self):
        r = Rules.from_json(
            {"policy": "open", "allow": [], "secrets": [{"name": "STRAY_KEY", "placeholder": ACME, "hosts": []}]},
            {"DEV_CONTAINER_SECRET_STRAY_KEY": "stray_real"},
        )
        d = decide(r, "https", "api.github.com", 443, "GET", "https://api.github.com/", [("Authorization", "Bearer " + ACME)])
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5004")
        self.assertIn("STRAY_KEY is bound to no host", d.blocked.render())


class Allowlist(unittest.TestCase):
    def test_blocks_unlisted_hosts(self):
        d = request("example.com", [], policy="allowlist", allow=["registry.npmjs.org"])
        self.assertEqual(d.blocked.code, "DEV_CONTAINER_B5001")

    def test_allows_listed_and_secret_hosts(self):
        self.assertIsNone(request("registry.npmjs.org", [], policy="allowlist", allow=["registry.npmjs.org"]).blocked)
        self.assertIsNone(request("api.github.com", [], policy="allowlist").blocked)

    def test_connect_targets(self):
        r = rules("allowlist", ["registry.npmjs.org"])
        self.assertTrue(allowed(r, "registry.npmjs.org", 443))
        self.assertTrue(allowed(r, "GitHub.com.", 22))
        self.assertFalse(allowed(r, "evil.example", 22))

    def test_open_policy_allows_anything(self):
        self.assertIsNone(request("example.com", []).blocked)


if __name__ == "__main__":
    unittest.main()
