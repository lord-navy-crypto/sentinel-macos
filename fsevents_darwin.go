// SPDX-License-Identifier: MPL-2.0
//go:build darwin && cgo

package main

/*
#cgo darwin LDFLAGS: -framework CoreServices -framework CoreFoundation
#include <CoreServices/CoreServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <dispatch/dispatch.h>
#include <stdlib.h>
extern void sentinelGoFSEvent(char*, unsigned int, unsigned long long);
static FSEventStreamRef stream=NULL; static dispatch_queue_t queue=NULL;
static void cb(ConstFSEventStreamRef s,void *i,size_t n,void *paths,const FSEventStreamEventFlags flags[],const FSEventStreamEventId ids[]){char **p=paths;for(size_t x=0;x<n;x++)sentinelGoFSEvent(p[x],(unsigned int)flags[x],(unsigned long long)ids[x]);}
static int startStream(char **paths,int count,unsigned long long since,double latency){if(stream)return 0;CFMutableArrayRef a=CFArrayCreateMutable(kCFAllocatorDefault,count,&kCFTypeArrayCallBacks);if(!a)return -1;for(int i=0;i<count;i++){CFStringRef s=CFStringCreateWithCString(kCFAllocatorDefault,paths[i],kCFStringEncodingUTF8);if(s){CFArrayAppendValue(a,s);CFRelease(s);}}FSEventStreamCreateFlags f=kFSEventStreamCreateFlagFileEvents|kFSEventStreamCreateFlagWatchRoot|kFSEventStreamCreateFlagNoDefer;FSEventStreamEventId startId = since == 0 ? kFSEventStreamEventIdSinceNow : (FSEventStreamEventId)since;stream=FSEventStreamCreate(kCFAllocatorDefault,cb,NULL,a,startId,latency,f);CFRelease(a);if(!stream)return -2;queue=dispatch_queue_create("org.sentinel.fsevents",DISPATCH_QUEUE_SERIAL);if(!queue)return -3;FSEventStreamSetDispatchQueue(stream,queue);if(!FSEventStreamStart(stream))return -4;return 0;}
static void stopStream(void){if(!stream)return;FSEventStreamStop(stream);FSEventStreamSetDispatchQueue(stream,NULL);FSEventStreamInvalidate(stream);FSEventStreamRelease(stream);stream=NULL;if(queue){dispatch_release(queue);queue=NULL;}}
*/
import "C"
import (
	"errors"
	"sync"
	"unsafe"
)

var nativeMu sync.RWMutex
var nativeCB func(string, uint32, uint64)

//export sentinelGoFSEvent
func sentinelGoFSEvent(path *C.char, flags C.uint, id C.ulonglong) {
	nativeMu.RLock()
	cb := nativeCB
	nativeMu.RUnlock()
	if cb != nil {
		cb(C.GoString(path), uint32(flags), uint64(id))
	}
}
func nativeFSEventsAvailable() bool { return true }
func startNativeFSEvents(paths []string, since uint64, cb func(string, uint32, uint64)) error {
	if len(paths) == 0 {
		return errors.New("no roots")
	}
	cp := make([]*C.char, len(paths))
	for i, p := range paths {
		cp[i] = C.CString(p)
		defer C.free(unsafe.Pointer(cp[i]))
	}
	nativeMu.Lock()
	nativeCB = cb
	nativeMu.Unlock()
	if C.startStream((**C.char)(unsafe.Pointer(&cp[0])), C.int(len(cp)), C.ulonglong(since), C.double(.75)) != 0 {
		return errors.New("FSEventStream failed to start")
	}
	return nil
}
func stopNativeFSEvents() { C.stopStream(); nativeMu.Lock(); nativeCB = nil; nativeMu.Unlock() }
