"""Pure request policy for the broker. No mitmproxy imports, so it is testable on stock Python."""

import base64
import binascii
import re
from dataclasses import dataclass, field

PLACEHOLDER = re.compile(r"dc-[A-Za-z_][A-Za-z0-9_]*-[0-9a-f]{16}")


@dataclass(frozen=True)
class Secret:
    name: str
    placeholder: str
    hosts: tuple
    value: str


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
            )
            for s in data["secrets"]
        )
        return cls(policy=data["policy"], allow=tuple(data["allow"]), secrets=secrets)


@dataclass
class Decision:
    blocked: str = ""
    headers: list = field(default_factory=list)
    injected: list = field(default_factory=list)


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


def decide(rules, scheme, host, port, url, headers):
    """Decide what to do with one request.

    `host`/`port` MUST be the real upstream target (the CONNECT authority or
    absolute-form URL), never the client-controlled Host header.
    """
    host = _normalize(host)
    by_placeholder = {s.placeholder: s for s in rules.secrets}

    if not allowed(rules, host, port):
        return Decision(blocked="host %s is not on the allowlist" % host)

    if PLACEHOLDER.search(url):
        return Decision(blocked="placeholder in URL")

    injected = []

    def substitute(text):
        def swap(match):
            secret = by_placeholder.get(match.group(0))
            if secret is None:
                raise _Block("unknown placeholder (stale container?)")
            if not any(host_matches(p, host, port) for p in secret.hosts):
                raise _Block("%s is not bound to %s" % (secret.name, host))
            if scheme != "https":
                raise _Block("refusing to send %s over %s" % (secret.name, scheme))
            if not secret.value:
                raise _Block("%s has no value in the broker" % secret.name)
            if secret.name not in injected:
                injected.append(secret.name)
            return secret.value

        return PLACEHOLDER.sub(swap, text)

    out = []
    try:
        for name, value in headers:
            out.append((name, _substitute_header(value, substitute)))
    except _Block as block:
        return Decision(blocked=str(block))
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
