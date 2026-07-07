import React from 'react';
import { Col, Form } from '@/components/ui/core';
import type { ColProps } from '@/components/ui/core';
import type { FormItemProps } from '@/components/ui/core';
import { PowerInput } from './PowerInput';

interface PowerFormItemProps extends FormItemProps {
  /** Field name that controls heating method */
  dependencyName: string;
  /** Column layout for the inner item */
  colProps?: ColProps;
}

/**
 * Display power input when heating method includes "加热棒" or any
 * "加热板" option.
 */
export const PowerFormItem: React.FC<PowerFormItemProps> = ({
  dependencyName,
  colProps = { xs: 24, md: 12 },
  ...itemProps
}) => {
  return (
    <Form.Item noStyle dependencies={[dependencyName]}>
      {({ getFieldValue }) => {
        const methods = getFieldValue(dependencyName);
        const showVoltage = Array.isArray(methods)
          ? methods.some(
              (m: string) => m === '加热棒' || String(m).includes('加热板')
            )
          :
              methods &&
              (methods === '加热棒' || String(methods).includes('加热板'));

        return showVoltage ? (
          <Col {...colProps}>
            <Form.Item {...itemProps}>
              <PowerInput />
            </Form.Item>
          </Col>
        ) : null;
      }}
    </Form.Item>
  );
};

export default PowerFormItem;
