"""Pure request policy for the broker. No mitmproxy imports, so it is testable on stock Python."""

import base64
import binascii
import posixpath
import re
from dataclasses import dataclass, field
from urllib.parse import unquote, urlsplit

PLACEHOLDER = re.compile(r"dc-[A-Za-z_][A-Za-z0-9_]*-[0-9a-f]{16}")

# Shares its docs directory with the TypeScript catalog in src/diagnostics.ts.
DOCS_BASE = "https://github.com/antfu/dev-container/blob/main/docs/errors"
HOST_SIDE = "This is configured on the host in dev-container.config.ts; it cannot be changed from inside the container"


@dataclass(frozen=True)
class RequestRule:
    action: str
    methods: tuple
    path: str

    def matches(self, method, path):
        if self.methods and method.upper() not in self.methods:
            return False
        return self.path is None or path_matches(self.path, path)

    def describe(self):
        return "%s %s" % ("|".join(self.methods) or "*", self.path or "/**")


@dataclass(frozen=True)
class Secret:
    name: str
    placeholder: str
    hosts: tuple
    value: str
    rules: tuple = ()

    def permits(self, method, path):
        """First matching rule wins; a request no rule matches is allowed."""
        for rule in self.rules:
            if rule.matches(method, path):
                return rule.action == "allow", rule
        return True, None


@dataclass(frozen=True)
class Rules:
    policy: str
    allow: tuple
    secrets: tuple

    @classmethod
    def from_json(cls, data, environ):
        secrets = tuple(
            Secret(
                name=s["name"],
                placeholder=s["placeholder"],
                hosts=tuple(s["hosts"]),
                value=environ.get("DEV_CONTAINER_SECRET_" + s["name"], ""),
                rules=tuple(
                    RequestRule(action=r["action"], methods=tuple(m.upper() for m in r.get("methods", ())), path=r.get("path"))
                    for r in s.get("rules", ())
                ),
            )
            for s in data["secrets"]
        )
        return cls(policy=data["policy"], allow=tuple(data["allow"]), secrets=secrets)


@dataclass(frozen=True)
class Block:
    code: str
    why: str
    fix: str

    def render(self):
        """Same layout as nostics' plain formatter, so agents read one format everywhere."""
        return "[%s] %s\n\u251c\u25b6 fix: %s\n\u2570\u25b6 see: %s/%s.md\n" % (self.code, self.why, self.fix, DOCS_BASE, self.code)


@dataclass
class Decision:
    blocked: Block = None
    headers: list = field(default_factory=list)
    injected: list = field(default_factory=list)


def not_allowed(host):
    return Block(
        "DEV_CONTAINER_B5001",
        "Host %s is not on the egress allowlist." % host,
        "Ask for `%s` to be added to `egress.allow`, then `dev-container up`. %s." % (host, HOST_SIDE),
    )


def host_matches(pattern, host, port):
    """`host`, `*.host` (subdomains only), either optionally suffixed with `:port`."""
    name, _, want_port = pattern.lower().partition(":")
    if want_port and int(want_port) != port:
        return False
    if name.startswith("*."):
        return host.endswith(name[1:])
    return host == name


def allowed(rules, host, port):
    """Egress policy for a target; secret hosts are always reachable."""
    if rules.policy != "allowlist":
        return True
    patterns = rules.allow + tuple(h for s in rules.secrets for h in s.hosts)
    return any(host_matches(p, _normalize(host), port) for p in patterns)


def _normalize(host):
    return host.lower().rstrip(".")


def request_path(url):
    """The path a server will most likely act on: decoded once, with `//`, `.` and `..` resolved."""
    path = re.sub("/+", "/", "/" + unquote(urlsplit(url).path))
    return posixpath.normpath(path)


def path_matches(pattern, path):
    """`*` matches within one segment, a `**` segment matches any number of them.

    Case-insensitive, because APIs such as GitHub's treat owner and repo names that way.
    """
    regex = ""
    for part in pattern.split("/")[1:]:
        if part == "**":
            regex += "(?:/[^/]*)*"
        else:
            regex += "/" + "[^/]*".join(re.escape(piece) for piece in part.split("*"))
    return re.fullmatch(regex, path, re.IGNORECASE) is not None


def not_permitted(secret, method, path, rule):
    return Block(
        "DEV_CONTAINER_B5007",
        "%s may not be used for %s %s (rule `%s %s`)." % (secret.name, method.upper(), path, rule.action, rule.describe()),
        "Do this without %s, or ask for that secret's `rules` to permit it. %s." % (secret.name, HOST_SIDE),
    )


def decide(rules, scheme, host, port, method, url, headers):
    """Decide what to do with one request.

    `host`/`port` MUST be the real upstream target (the CONNECT authority or
    absolute-form URL), never the client-controlled Host header.
    """
    host = _normalize(host)
    by_placeholder = {s.placeholder: s for s in rules.secrets}

    if not allowed(rules, host, port):
        return Decision(blocked=not_allowed(host))

    if PLACEHOLDER.search(url):
        return Decision(blocked=Block(
            "DEV_CONTAINER_B5002",
            "A secret placeholder appears in the URL; the broker only injects secrets into request headers.",
            "Send the credential in a header such as `Authorization` or `x-api-key` instead of the query string.",
        ))

    injected = []

    def substitute(text):
        def swap(match):
            secret = by_placeholder.get(match.group(0))
            if secret is None:
                raise _Block(Block(
                    "DEV_CONTAINER_B5003",
                    "The request carries a placeholder the broker does not know, usually one from before the last `dev-container up`.",
                    "Read the token from its environment variable again instead of a stored copy; if the variable itself is stale, restart the container with `dev-container up` on the host.",
                ))
            if not any(host_matches(p, host, port) for p in secret.hosts):
                raise _Block(Block(
                    "DEV_CONTAINER_B5004",
                    "%s is not bound to %s, so the broker will not send it there." % (secret.name, host),
                    "Send %s only to %s. If %s truly needs it, ask for the host to be added to that secret's `hosts`. %s." % (secret.name, ", ".join(secret.hosts), host, HOST_SIDE),
                ))
            if scheme != "https":
                raise _Block(Block(
                    "DEV_CONTAINER_B5005",
                    "Refusing to send %s over %s." % (secret.name, scheme),
                    "Use an https:// URL for %s." % host,
                ))
            if not secret.value:
                raise _Block(Block(
                    "DEV_CONTAINER_B5006",
                    "%s has no value in the broker." % secret.name,
                    "Ask for %s to be set on the host (e.g. in .env.secret), then `dev-container up`. %s." % (secret.name, HOST_SIDE),
                ))
            if secret.name not in injected:
                injected.append(secret.name)
            return secret.value

        return PLACEHOLDER.sub(swap, text)

    out = []
    try:
        for name, value in headers:
            out.append((name, _substitute_header(value, substitute)))
    except _Block as block:
        return Decision(blocked=block.args[0])

    path = request_path(url)
    for name in injected:
        secret = next(s for s in rules.secrets if s.name == name)
        permitted, rule = secret.permits(method, path)
        if not permitted:
            return Decision(blocked=not_permitted(secret, method, path, rule))
    return Decision(headers=out, injected=injected)


class _Block(Exception):
    pass


def _substitute_header(value, substitute):
    scheme, _, credentials = value.partition(" ")
    if scheme.lower() == "basic" and credentials:
        try:
            decoded = base64.b64decode(credentials.strip(), validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return substitute(value)
        replaced = substitute(decoded)
        if replaced != decoded:
            return scheme + " " + base64.b64encode(replaced.encode("utf-8")).decode("ascii")
        return value
    return substitute(value)
