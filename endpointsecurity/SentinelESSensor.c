// Sentinel optional Endpoint Security notification sensor scaffold.
// This sensor DOES NOT authorize or block events. It only subscribes to
// notification events and prints compact local JSON lines to stdout.
// Building/running it requires Apple's Endpoint Security entitlement and
// user approval / Full Disk Access. Do not treat compilation as entitlement.
#ifdef __APPLE__
#include <EndpointSecurity/EndpointSecurity.h>
#include <dispatch/dispatch.h>
#include <bsm/libbsm.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static es_client_t *g_client = NULL;
static void print_token(es_string_token_t t) { printf("%.*s", (int)t.length, t.data ? t.data : ""); }
static void on_message(es_client_t *client, const es_message_t *m) {
    (void)client;
    printf("{\"event_type\":%u,\"pid\":%d,\"process\":\"", (unsigned)m->event_type, audit_token_to_pid(m->process->audit_token));
    print_token(m->process->executable->path);
    printf("\"}\n");
    fflush(stdout);
}
static void stop_sensor(int sig) { (void)sig; if (g_client) es_delete_client(g_client); _exit(0); }
int main(void) {
    signal(SIGINT, stop_sensor); signal(SIGTERM, stop_sensor);
    es_new_client_result_t r = es_new_client(&g_client, ^(es_client_t *c, const es_message_t *m){ on_message(c,m); });
    if (r != ES_NEW_CLIENT_RESULT_SUCCESS) { fprintf(stderr,"es_new_client failed: %d\n", (int)r); return 2; }
    es_event_type_t events[] = {ES_EVENT_TYPE_NOTIFY_EXEC, ES_EVENT_TYPE_NOTIFY_FORK, ES_EVENT_TYPE_NOTIFY_EXIT, ES_EVENT_TYPE_NOTIFY_MOUNT};
    if (es_subscribe(g_client, events, sizeof(events)/sizeof(events[0])) != ES_RETURN_SUCCESS) { fprintf(stderr,"es_subscribe failed\n"); es_delete_client(g_client); return 3; }
    dispatch_main();
    return 0;
}
#else
int main(void) { return 1; }
#endif
