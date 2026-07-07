import { useEffect, useState } from "react";
import * as ww from "@wecom/jssdk";
import { Form, message } from "@/components/ui/core";
import { CustomerService } from "@/api/services/customer.service";
import { AuthService } from "@/api/services/auth.service";
import { useAuthStore } from "@/store/useAuthStore";
import { getContext } from "@/utils/wecom";

export function useExternalContactBindingState(locationSearch: string) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [userContext, setUserContext] = useState<any>();
  const [text, setText] = useState("1234");
  const [externalId, setExternalId] = useState("wmPE-hBwAAXgxua0L255oBrIY0K_I9iA");
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const fetchUserContext = async (userId: string) => {
      try {
        const res = await CustomerService.getInfo(userId);
        setUserContext(res);
        form.setFieldsValue({
          name: res.name,
          phone: res.phone,
          gender: res["gender"] == 1 ? "male" : res["gender"] == 2 ? "female" : "",
        });
      } catch (error) {
        console.error("获取用户信息失败:", error);
        message.error("获取用户信息失败");
      }
    };

    const checkQywxContext = async () => {
      try {
        ww.register({
          corpId: import.meta.env.VITE_CORP_ID,
          agentId: import.meta.env.VITE_AGENT_ID,
          jsApiList: ["getContext", "getCurExternalContact", "checkJsApi"],
          getConfigSignature: AuthService.getConfigSignature,
          getAgentConfigSignature: AuthService.getAgentSignature,
        });
        const context = await getContext();
        if (context.entry == "single_chat_tools") {
          setText(context.entry);
          setShowForm(true);
          const external = await ww.getCurExternalContact();
          setExternalId(external.userId);
          const link = await CustomerService.getJdyId(external.userId);
          if (link) {
            window.location.href = link;
          } else {
            await fetchUserContext(external.userId);
          }
        }
      } catch (error) {
        message.error(`检测企业微信上下文失败:${JSON.stringify(error)}`);
      } finally {
        setLoading(false);
      }
    };

    async function checkIsInWeChat() {
      try {
        await ww.getContext();
        return true;
      } catch (error) {
        console.error("不在企业微信/微信环境中:", error);
        return false;
      }
    }

    void checkQywxContext();
    void checkIsInWeChat();
    window.addEventListener("hashchange", checkQywxContext);

    return () => {
      window.removeEventListener("hashchange", checkQywxContext);
    };
  }, [locationSearch, externalId, form, isAuthenticated]);

  const handleSubmit = async (values: any) => {
    try {
      const link = (
        await CustomerService.matchCustomer({
          externalUserId: externalId,
          corpName: values.company.value,
          jdyId: values.company.key.id,
          name: values.name,
          position: values.position,
          remark: values.remark,
          mobile: values.phone,
          isKeyDecisionMaker: values.isKeyDecisionMaker,
          updateQywxRemark: values.updateQywxRemark,
        })
      ).link;
      message.success("客户绑定成功");
      window.location.href = link;
    } catch (error) {
      message.error("客户绑定失败");
    }
  };

  return {
    form,
    loading,
    showForm,
    text,
    userContext,
    handleSubmit,
  };
}

