import { Button, Modal, message } from "@/components/ui/core";

function TestComponent() {
  const showModal = () => {
    Modal.info({
      title: "测试弹窗",
      content: "这是一个测试弹窗",
    });
  };

  return (
    <div>
      <Button onClick={showModal}>打开弹窗</Button>
      <Button onClick={() => message.success("测试消息")}>显示消息</Button>
    </div>
  );
}
export default TestComponent;
