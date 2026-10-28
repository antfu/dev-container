/** @type {import('../src').UserConfig} */
export default {
  secrets: [{ env: 'ACME_KEY', hosts: ['postman-echo.com'] }],
  services: {
    agent: { image: 'curlimages/curl:8.23.0', command: ['sleep', 'infinity'] },
    web: { image: 'busybox:1.37', command: ['httpd', '-f', '-p', '3000'], ports: [3000] },
  },
}
