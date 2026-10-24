type Props={
 native:boolean;
 lanShareActive:boolean;
 lanPhase:string;
 lanStatus:string;
 publicProbe:string;
 publicProbeError:string;
 probeBusy:boolean;
 onOpenLan:()=>void;
 onOpenPublic:()=>void;
 onProbe:()=>void;
 onSystemHealth:()=>void;
};
/** Diagnostics never initiates LAN scan, STUN or TURN on mount. All probes are explicit. */
export default function CommonsConnectivityDiagnostics(props:Props){
 const {native,lanShareActive,lanPhase,lanStatus,publicProbe,publicProbeError,probeBusy,onOpenLan,onOpenPublic,onProbe,onSystemHealth}=props;
 return <div className="connection-diagnostics" data-testid="commons-connection-diagnostics">
  <header className="connection-diagnostics-heading">
   <p className="eyebrow">CONNECTIVITY / ON-DEMAND ONLY</p>
   <h3>连接诊断</h3>
   <p className="subtle">查看当前应用能够确认的状态。只有主动点击探测按钮才连接外部 STUN 服务；此页面不会扫描附近设备、读取消息或启动公网监听。</p>
  </header>
  <div className="diagnostic-grid">
   <section className="diagnostic-tile"><span className="diagnostic-icon" aria-hidden="true">⌘</span>
    <span>当前运行环境</span><strong>{native?"macOS 桌面客户端":"浏览器界面预览"}</strong>
    <small>{native?"可以使用原生局域网服务，实际可达性取决于网络与权限。":"局域网 TCP、Bonjour 和本机 STUN 探测需要安装桌面客户端。"}</small>
   </section>
   <section className="diagnostic-tile"><span className="diagnostic-icon" aria-hidden="true">⇄</span>
    <span>局域网文件分享</span><strong>{lanShareActive?"当前存在临时分享":"未启动临时分享"}</strong>
    <small>{lanShareActive?"本机服务状态："+lanPhase:"未开启分享不代表 Wi-Fi 离线。"}</small>
   </section>
   <section className="diagnostic-tile"><span className="diagnostic-icon" aria-hidden="true">◎</span>
    <span>公网路径</span><strong>{publicProbe?"已有 STUN 观测":"尚未主动探测"}</strong>
    <small>{publicProbe||"未执行公网映射观测；无法预测远端 WebRTC 是否可连接。"}</small>
   </section>
  </div>
  {lanStatus&&<p className="diagnostic-note" role="status">{lanStatus}</p>}
  {publicProbeError&&<p className="diagnostic-note" role="alert">公网探测反馈：{publicProbeError}</p>}
  <section className="diagnostic-steps">
   <h4>出现连接问题时，按顺序检查</h4>
   <ol>
    <li><strong>局域网：</strong> 两台 Mac 是否位于同一可互访 Wi-Fi / 有线网络？访客 Wi-Fi 可能阻止设备通信。</li>
    <li><strong>地址：</strong> 邀请应使用当前 Wi-Fi/有线网卡的 IPv4，而不是 127.0.0.1 或不可达的 VPN IP。</li>
    <li><strong>权限：</strong> 检查 macOS 防火墙、局域网访问权限及路由器 AP 隔离。</li>
    <li><strong>公网：</strong> 手动交换每次新的 WebRTC Offer/Answer；STUN 不保证 NAT 穿透，受限网络可能需要自行配置 TURN。</li>
    <li><strong>掉线：</strong> 局域网会话过期后可重新加入原房间；公网群聊需对原成员重新协商。</li>
   </ol>
  </section>
  <div className="actions">
   <button type="button" className="primary-button" onClick={onOpenLan}>检查局域网流程 →</button>
   <button type="button" className="secondary-button" onClick={onOpenPublic}>检查公网 WebRTC →</button>
   <button type="button" className="secondary-button" disabled={!native||probeBusy} onClick={onProbe}
    data-testid="diagnostics-stun-probe">{probeBusy?"正在探测…":"主动测试公网 STUN 映射"}</button>
   <button type="button" className="secondary-button" onClick={onSystemHealth}>本机功能自检 →</button>
  </div>
  <p className="subtle">STUN 观测结果只能说明 UDP 地址映射，不代表端到端聊天或文件传输成功。真正的双机验证需要两台实际设备。</p>
 </div>;
}
