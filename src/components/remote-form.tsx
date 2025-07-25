import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  ActionGroup,
  Button,
  Checkbox,
  ExpandableSection,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  InputGroup,
  InputGroupItem,
  Modal,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import DownloadIcon from '@patternfly/react-icons/dist/esm/icons/download-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon';
import { Component, type ReactNode } from 'react';
import { type RemoteType } from '../api';
import { AppContext, type IAppContextType } from '../app-context';
import {
  Alert,
  ExternalLink,
  FileUpload,
  FormFieldHelper,
  HelpButton,
} from '../components';
import {
  type ErrorMessagesType,
  downloadString,
  validateURLHelper,
} from '../utilities';

interface IProps {
  allowEditName?: boolean;
  closeModal: () => void;
  errorMessages: ErrorMessagesType;
  plugin: 'ansible' | 'container' | 'file' | 'debian';
  remote: RemoteType;
  saveRemote: () => void;
  showMain?: boolean;
  showModal?: boolean;
  title?: string;
  updateRemote: (remote) => void;
}

interface FormFilename {
  name: string;
  original: boolean;
}

interface HiddenFieldType {
  name: string;
  is_set: boolean;
}

interface IState {
  filenames: {
    requirements_file: FormFilename;
    client_key: FormFilename;
    client_cert: FormFilename;
    ca_cert: FormFilename;
  };
}

function isHidden(name: string, hidden_fields: HiddenFieldType[]) {
  const field = hidden_fields.find((el) => el.name === name);
  return !!field;
}

function isFieldSet(name: string, hidden_fields: HiddenFieldType[]) {
  const field = hidden_fields.find((el) => el.name === name);
  console.log(hidden_fields)
  if (field) {
    return field.is_set;
  } else {
    // throw `Field ${name} is not in hidden_fields`;
  }
}

const HiddenField = ({
  onClear,
  isValueSet,
  children,
}: {
  /** Specify if the value is set on the backend already */
  isValueSet: boolean;

  /** Function to set the value to null */
  onClear: () => void;

  /** Component to display when the user is allowed to update this field. */
  children: ReactNode;
}) =>
  !isValueSet ? (
    <>{children}</>
  ) : (
    <InputGroup>
      <InputGroupItem isFill>
        <TextInput
          aria-label={t`hidden value`}
          placeholder='••••••••••••••••••••••'
          type='password'
          autoComplete='off'
          isDisabled={isValueSet}
        />
      </InputGroupItem>
      {isValueSet && (
        <Button onClick={() => onClear()} variant='control'>
          {t`Clear`}
        </Button>
      )}
    </InputGroup>
  );

export class RemoteForm extends Component<IProps, IState> {
  static contextType = AppContext;

  constructor(props) {
    super(props);
    console.log(props);
    const { requirements_file, client_key, client_cert, ca_cert } =
      props.remote || {};

    this.state = {
      filenames: {
        requirements_file: {
          name: requirements_file ? 'requirements.yml' : '',
          original: !!requirements_file,
        },
        client_key: {
          name: client_key ? 'client_key' : '',
          original: !!client_key,
        },
        client_cert: {
          name: client_cert ? 'client_cert' : '',
          original: !!client_cert,
        },
        ca_cert: {
          name: ca_cert ? 'ca_cert' : '',
          original: !!ca_cert,
        },
      },
    };

    // Shim in a default concurrency value to pass form validation
    if (
      this.props.plugin !== 'container' &&
      this.props.remote.download_concurrency === null
    ) {
      this.updateRemote(10, 'download_concurrency');
    }
  }

  render() {
    const {
      allowEditName,
      closeModal,
      plugin,
      remote,
      saveRemote,
      showMain,
      showModal,
      title,
    } = this.props;

    if (!remote) {
      return null;
    }

    const requiredFields = ['name', 'url'];
    let disabledFields = allowEditName ? [] : ['name'];

    const isCommunityRemote =
      plugin === 'ansible' && remote?.url === 'https://galaxy.ansible.com/api/';

    switch (plugin) {
      case 'ansible':
        // nothing disabled
        break;

      case 'container':
      case 'debian':
        disabledFields = disabledFields.concat([
          'client_key',
          'proxy_username',
          'proxy_password',
          'username',
          'password',
          'token',
          'auth_url',
          'requirements_file',
          'signed_only',
          'sync_dependencies',
        ]);
        break;
      case 'file':
        disabledFields = disabledFields.concat([
          'auth_url',
          'token',
          'requirements_file',
          'signed_only',
          'sync_dependencies',
        ]);
        break;
    }

    const save = (
      <Button
        isDisabled={!this.isValid(requiredFields)}
        key='confirm'
        variant='primary'
        onClick={() => saveRemote()}
      >
        {t`Save`}
      </Button>
    );
    const cancel = (
      <Button key='cancel' variant='link' onClick={() => closeModal()}>
        {t`Cancel`}
      </Button>
    );

    if (showMain) {
      return (
        <>
          {this.renderForm(requiredFields, disabledFields, {
            extra: (
              <ActionGroup key='actions'>
                {save}
                {cancel}
              </ActionGroup>
            ),
            isCommunityRemote,
          })}
        </>
      );
    }

    return (
      <Modal
        isOpen={showModal}
        title={title || t`Edit remote`}
        variant='small'
        onClose={() => closeModal()}
        actions={[save, cancel]}
      >
        {this.renderForm(requiredFields, disabledFields, { isCommunityRemote })}
      </Modal>
    );
  }

  private renderForm(
    requiredFields,
    disabledFields,
    {
      extra,
      isCommunityRemote,
    }: { extra?: ReactNode; isCommunityRemote: boolean },
  ) {
    const { errorMessages, remote } = this.props;
    const { filenames } = this.state;
    const { collection_signing } = (this.context as IAppContextType)
      .featureFlags;

    const docsAnsibleLink = (
      <ExternalLink href='https://docs.ansible.com/ansible/latest/user_guide/collections_using.html#install-multiple-collections-with-a-requirements-file'>
        requirements.yml
      </ExternalLink>
    );

    const yamlTemplate = [
      '# Sample requirements.yaml',
      '',
      'collections:',
      '  - name: my_namespace.my_collection_name',
      '  - name: my_namespace.my_collection_name2',
    ].join('\n');

    const filename = (field) =>
      filenames[field].original ? t`(uploaded)` : filenames[field].name;

    const fileOnChange = (field) => (_event, file) => {
      this.setState(
        {
          filenames: {
            ...filenames,
            [field]: {
              name: file.name,
              original: false,
            },
          },
        },
        () => file.text().then((text) => this.updateRemote(text, field)),
      );
    };

    return (
      <Form>
        <FormGroup
          fieldId={'name'}
          label={t`Name`}
          isRequired={requiredFields.includes('name')}
        >
          <TextInput
            validated={'name' in errorMessages ? 'error' : 'default'}
            isRequired={requiredFields.includes('name')}
            isDisabled={disabledFields.includes('name')}
            id='name'
            type='text'
            value={remote.name || ''}
            onChange={(_event, value) => this.updateRemote(value, 'name')}
          />
          <FormFieldHelper
            variant={'name' in errorMessages ? 'error' : 'default'}
          >
            {errorMessages['name']}
          </FormFieldHelper>
        </FormGroup>

        <FormGroup
          fieldId={'url'}
          label={t`URL`}
          labelIcon={
            <HelpButton content={t`The URL of an external content source.`} />
          }
          isRequired={requiredFields.includes('url')}
        >
          <TextInput
            validated={
              validateURLHelper(errorMessages['url'], remote.url).variant
            }
            isRequired={requiredFields.includes('url')}
            isDisabled={disabledFields.includes('url')}
            id='url'
            type='text'
            value={remote.url || ''}
            onChange={(_event, value) => this.updateRemote(value, 'url')}
          />
          <FormFieldHelper
            {...validateURLHelper(errorMessages['url'], remote.url)}
          />
        </FormGroup>

        {!disabledFields.includes('signed_only') && collection_signing ? (
          <FormGroup
            fieldId={'signed_only'}
            label={t`Download only signed collections`}
          >
            {isCommunityRemote && this.props.remote.signed_only ? (
              <Alert
                isInline
                variant='warning'
                title={t`Community content will never be synced if this setting is enabled`}
              />
            ) : null}
            <Switch
              id='signed_only'
              isChecked={!!remote.signed_only}
              onChange={(_event, value) =>
                this.updateRemote(value, 'signed_only')
              }
            />
          </FormGroup>
        ) : null}

        {!disabledFields.includes('sync_dependencies') ? (
          <FormGroup
            fieldId={'sync_dependencies'}
            label={t`Include all dependencies when syncing a collection.`}
          >
            <Switch
              id='sync_dependencies'
              isChecked={!!remote.sync_dependencies}
              onChange={(_event, value) =>
                this.updateRemote(value, 'sync_dependencies')
              }
            />
          </FormGroup>
        ) : null}

        {!disabledFields.includes('token') && (
          <FormGroup
            fieldId={'token'}
            label={t`Token`}
            labelIcon={
              <HelpButton
                content={t`Token for authenticating to the server URL.`}
              />
            }
            isRequired={requiredFields.includes('token')}
          >
            <HiddenField
              isValueSet={isFieldSet('token', remote.hidden_fields)}
              onClear={() => this.updateIsSet('token', false)}
            >
              <TextInput
                validated={'token' in errorMessages ? 'error' : 'default'}
                isRequired={requiredFields.includes('token')}
                type='password'
                autoComplete='off'
                id='token'
                value={remote.token || ''}
                onChange={(_event, value) => this.updateRemote(value, 'token')}
              />
            </HiddenField>
            <FormFieldHelper
              variant={'token' in errorMessages ? 'error' : 'default'}
            >
              {errorMessages['token']}
            </FormFieldHelper>
          </FormGroup>
        )}

        {!disabledFields.includes('auth_url') && (
          <FormGroup
            fieldId={'auth_url'}
            label={t`SSO URL`}
            labelIcon={<HelpButton content={t`Single sign on URL.`} />}
            isRequired={requiredFields.includes('auth_url')}
          >
            <TextInput
              validated={'auth_url' in errorMessages ? 'error' : 'default'}
              isRequired={requiredFields.includes('auth_url')}
              id='ssoUrl'
              type='text'
              value={this.props.remote.auth_url || ''}
              onChange={(_event, value) => this.updateRemote(value, 'auth_url')}
            />
            <FormFieldHelper
              variant={'auth_url' in errorMessages ? 'error' : 'default'}
            >
              {errorMessages['auth_url']}
            </FormFieldHelper>
          </FormGroup>
        )}

        {!disabledFields.includes('requirements_file') && (
          <FormGroup
            fieldId={'yaml'}
            label={t`YAML requirements`}
            labelIcon={
              <HelpButton
                content={
                  <Trans>
                    This uses the same {docsAnsibleLink} format as the
                    ansible-galaxy CLI with the caveat that roles aren&apos;t
                    supported and the source parameter is not supported.
                  </Trans>
                }
              />
            }
            isRequired={requiredFields.includes('requirements_file')}
          >
            {isCommunityRemote && !this.props.remote.requirements_file ? (
              <Alert
                isInline
                variant='warning'
                title={t`YAML requirements are required to sync from Galaxy`}
              />
            ) : null}
            <Flex>
              <FlexItem grow={{ default: 'grow' }}>
                <FileUpload
                  validated={
                    'requirements_file' in errorMessages ? 'error' : 'default'
                  }
                  isRequired={requiredFields.includes('requirements_file')}
                  id='requirements_file'
                  type='text'
                  filename={filename('requirements_file')}
                  value={this.props.remote.requirements_file || ''}
                  hideDefaultPreview
                  onFileInputChange={fileOnChange('requirements_file')}
                />
              </FlexItem>
              <FlexItem>
                <Button
                  isDisabled={!this.props.remote.requirements_file}
                  onClick={() =>
                    downloadString(
                      this.props.remote.requirements_file,
                      filenames.requirements_file.name,
                    )
                  }
                  variant='plain'
                  aria-label={t`Download requirements file`}
                >
                  <DownloadIcon />
                </Button>
              </FlexItem>
            </Flex>
            <ExpandableSection
              toggleTextExpanded={t`Close YAML editor`}
              toggleTextCollapsed={t`Edit in YAML editor`}
            >
              <Flex>
                <FlexItem grow={{ default: 'grow' }}>
                  <ExclamationTriangleIcon />{' '}
                  {t`If you populate this requirements file, this remote will only sync collections from this file, otherwise all collections will be synchronized.`}
                  <textarea
                    value={this.props.remote.requirements_file}
                    onChange={(value) =>
                      this.updateRemote(value, 'requirements_file')
                    }
                  />
                  {this.props.remote.requirements_file == null ? (
                    <>
                      <pre>{yamlTemplate}</pre>
                      <Button
                        variant='plain'
                        onClick={() =>
                          this.updateRemote(yamlTemplate, 'requirements_file')
                        }
                      >{t`Use template`}</Button>
                      <Button
                        variant='plain'
                        onClick={() =>
                          this.updateRemote('\n', 'requirements_file')
                        }
                      >{t`Start from scratch`}</Button>
                    </>
                  ) : null}
                </FlexItem>
              </Flex>
            </ExpandableSection>
            <FormFieldHelper
              variant={
                'requirements_file' in errorMessages ? 'error' : 'default'
              }
            >
              {errorMessages['requirements_file']}
            </FormFieldHelper>
          </FormGroup>
        )}

        <FormGroup
          data-cy='username'
          fieldId={'username'}
          label={t`Username`}
          labelIcon={
            <HelpButton
              content={
                disabledFields.includes('token')
                  ? t`The username to be used for authentication when syncing.`
                  : t`The username to be used for authentication when syncing. This is not required when using a token.`
              }
            />
          }
          isRequired={requiredFields.includes('username')}
        >
          <HiddenField
            isValueSet={
              isHidden('username', remote.hidden_fields) &&
              isFieldSet('username', remote.hidden_fields)
            }
            onClear={() => this.updateIsSet('username', false)}
          >
            <TextInput
              validated={'username' in errorMessages ? 'error' : 'default'}
              isRequired={requiredFields.includes('username')}
              isDisabled={disabledFields.includes('username')}
              id='username'
              type='text'
              value={remote.username || ''}
              onChange={(_event, value) => this.updateRemote(value, 'username')}
            />
          </HiddenField>
          <FormFieldHelper
            variant={'username' in errorMessages ? 'error' : 'default'}
          >
            {errorMessages['username']}
          </FormFieldHelper>
        </FormGroup>

        <FormGroup
          data-cy='password'
          fieldId={'password'}
          label={t`Password`}
          labelIcon={
            <HelpButton
              content={
                disabledFields.includes('token')
                  ? t`The password to be used for authentication when syncing.`
                  : t`The password to be used for authentication when syncing. This is not required when using a token.`
              }
            />
          }
          isRequired={requiredFields.includes('password')}
        >
          <HiddenField
            isValueSet={isFieldSet('password', remote.hidden_fields)}
            onClear={() => this.updateIsSet('password', false)}
          >
            <TextInput
              validated={'password' in errorMessages ? 'error' : 'default'}
              isRequired={requiredFields.includes('password')}
              isDisabled={disabledFields.includes('password')}
              id='password'
              type='password'
              autoComplete='off'
              value={remote.password || ''}
              onChange={(_event, value) => this.updateRemote(value, 'password')}
            />
          </HiddenField>
          <FormFieldHelper
            variant={'password' in errorMessages ? 'error' : 'default'}
          >
            {errorMessages['password']}
          </FormFieldHelper>
        </FormGroup>

        <ExpandableSection
          toggleTextExpanded={t`Hide advanced options`}
          toggleTextCollapsed={t`Show advanced options`}
        >
          <div className='pf-v5-c-form'>
            <FormGroup
              fieldId={'proxy_url'}
              label={t`Proxy URL`}
              isRequired={requiredFields.includes('proxy_url')}
            >
              <TextInput
                validated={'proxy_url' in errorMessages ? 'error' : 'default'}
                isRequired={requiredFields.includes('proxy_url')}
                isDisabled={disabledFields.includes('proxy_url')}
                id='proxy_url'
                type='text'
                value={remote.proxy_url || ''}
                onChange={(_event, value) =>
                  this.updateRemote(value, 'proxy_url')
                }
              />
              <FormFieldHelper
                variant={'proxy_url' in errorMessages ? 'error' : 'default'}
              >
                {errorMessages['proxy_url']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              data-cy='proxy_username'
              fieldId={'proxy_username'}
              label={t`Proxy username`}
              isRequired={requiredFields.includes('proxy_username')}
            >
              <HiddenField
                isValueSet={
                  isHidden('proxy_username', remote.hidden_fields) &&
                  isFieldSet('proxy_username', remote.hidden_fields)
                }
                onClear={() => this.updateIsSet('proxy_username', false)}
              >
                <TextInput
                  validated={
                    'proxy_username' in errorMessages ? 'error' : 'default'
                  }
                  isRequired={requiredFields.includes('proxy_username')}
                  isDisabled={disabledFields.includes('proxy_username')}
                  id='proxy_username'
                  type='text'
                  value={remote.proxy_username || ''}
                  onChange={(_event, value) =>
                    this.updateRemote(value, 'proxy_username')
                  }
                />
              </HiddenField>
              <FormFieldHelper
                variant={
                  'proxy_username' in errorMessages ? 'error' : 'default'
                }
              >
                {errorMessages['proxy_username']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              data-cy='proxy_password'
              fieldId={'proxy_password'}
              label={t`Proxy password`}
              isRequired={requiredFields.includes('proxy_password')}
            >
              <HiddenField
                isValueSet={isFieldSet('proxy_password', remote.hidden_fields)}
                onClear={() => this.updateIsSet('proxy_password', false)}
              >
                <TextInput
                  validated={
                    'proxy_password' in errorMessages ? 'error' : 'default'
                  }
                  isRequired={requiredFields.includes('proxy_password')}
                  isDisabled={disabledFields.includes('proxy_password')}
                  id='proxy_password'
                  type='password'
                  autoComplete='off'
                  value={remote.proxy_password || ''}
                  onChange={(_event, value) =>
                    this.updateRemote(value, 'proxy_password')
                  }
                />
              </HiddenField>
              <FormFieldHelper
                variant={
                  'proxy_password' in errorMessages ? 'error' : 'default'
                }
              >
                {errorMessages['proxy_password']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              fieldId={'tls_validation'}
              label={t`TLS validation`}
              labelIcon={
                <HelpButton
                  content={t`If selected, TLS peer validation must be performed.`}
                />
              }
              isRequired={requiredFields.includes('tls_validation')}
            >
              <Checkbox
                onChange={(_event, value) =>
                  this.updateRemote(value, 'tls_validation')
                }
                id='tls_validation'
                isChecked={remote.tls_validation}
              />
              <FormFieldHelper
                variant={
                  'tls_validation' in errorMessages ? 'error' : 'default'
                }
              >
                {errorMessages['tls_validation']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              fieldId={'client_key'}
              label={t`Client key`}
              labelIcon={
                <HelpButton
                  content={t`A PEM encoded private key used for authentication.`}
                />
              }
              isRequired={requiredFields.includes('client_key')}
            >
              <HiddenField
                isValueSet={isFieldSet('client_key', remote.hidden_fields)}
                onClear={() => this.updateIsSet('client_key', false)}
              >
                <FileUpload
                  data-cy='client_key'
                  validated={
                    'client_key' in errorMessages ? 'error' : 'default'
                  }
                  isRequired={requiredFields.includes('client_key')}
                  id='client_key'
                  type='text'
                  filename={filename('client_key')}
                  value={this.props.remote.client_key || ''}
                  hideDefaultPreview
                  onFileInputChange={fileOnChange('client_key')}
                />
              </HiddenField>
              <FormFieldHelper
                variant={'client_key' in errorMessages ? 'error' : 'default'}
              >
                {errorMessages['client_key']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              fieldId={'client_cert'}
              label={t`Client certificate`}
              labelIcon={
                <HelpButton
                  content={t`A PEM encoded client certificate used for authentication.`}
                />
              }
              isRequired={requiredFields.includes('client_cert')}
            >
              <Flex>
                <FlexItem grow={{ default: 'grow' }}>
                  <FileUpload
                    validated={
                      'client_cert' in errorMessages ? 'error' : 'default'
                    }
                    isRequired={requiredFields.includes('client_cert')}
                    id='client_cert'
                    type='text'
                    filename={filename('client_cert')}
                    value={this.props.remote.client_cert || ''}
                    hideDefaultPreview
                    onFileInputChange={fileOnChange('client_cert')}
                  />
                </FlexItem>
                <FlexItem>
                  <Button
                    data-cy='client_cert'
                    isDisabled={!this.props.remote.client_cert}
                    onClick={() =>
                      downloadString(
                        this.props.remote.client_cert,
                        filenames.client_cert.name,
                      )
                    }
                    variant='plain'
                    aria-label={t`Download client certification file`}
                  >
                    <DownloadIcon />
                  </Button>
                </FlexItem>
              </Flex>
              <FormFieldHelper
                variant={'client_cert' in errorMessages ? 'error' : 'default'}
              >
                {errorMessages['client_cert']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              fieldId={'ca_cert'}
              label={t`CA certificate`}
              labelIcon={
                <HelpButton
                  content={t`A PEM encoded client certificate used for authentication.`}
                />
              }
              isRequired={requiredFields.includes('ca_cert')}
            >
              <Flex>
                <FlexItem grow={{ default: 'grow' }}>
                  <FileUpload
                    validated={'ca_cert' in errorMessages ? 'error' : 'default'}
                    isRequired={requiredFields.includes('ca_cert')}
                    id='ca_cart'
                    type='text'
                    filename={filename('ca_cert')}
                    value={this.props.remote.ca_cert || ''}
                    hideDefaultPreview
                    onFileInputChange={fileOnChange('ca_cert')}
                  />
                </FlexItem>
                <FlexItem>
                  <Button
                    data-cy='ca_cert'
                    isDisabled={!this.props.remote.ca_cert}
                    onClick={() =>
                      downloadString(
                        this.props.remote.ca_cert,
                        filenames.ca_cert.name,
                      )
                    }
                    variant='plain'
                    aria-label={t`Download CA certification file`}
                  >
                    <DownloadIcon />
                  </Button>
                </FlexItem>
              </Flex>
              <FormFieldHelper
                variant={'ca_cert' in errorMessages ? 'error' : 'default'}
              >
                {errorMessages['ca_cert']}
              </FormFieldHelper>
            </FormGroup>

            <FormGroup
              fieldId={'download_concurrency'}
              label={t`Download concurrency`}
              labelIcon={
                <HelpButton
                  content={t`Total number of simultaneous connections.`}
                />
              }
            >
              <TextInput
                id='download_concurrency'
                type='number'
                value={remote.download_concurrency || ''}
                validated={
                  !this.isNumericSet(remote.download_concurrency) ||
                  remote.download_concurrency > 0
                    ? 'default'
                    : 'error'
                }
                onChange={(_event, value) =>
                  this.updateRemote(value, 'download_concurrency')
                }
              />
              <FormFieldHelper
                variant={
                  !this.isNumericSet(remote.download_concurrency) ||
                  remote.download_concurrency > 0
                    ? 'default'
                    : 'error'
                }
              >{t`Number must be greater than 0`}</FormFieldHelper>
            </FormGroup>

            <FormGroup
              fieldId={'rate_limit'}
              label={t`Rate limit`}
              labelIcon={
                <HelpButton
                  content={t`Limits total download rate in requests per second.`}
                />
              }
            >
              <TextInput
                id='rate_limit'
                type='number'
                value={remote.rate_limit || ''}
                onChange={(_event, value) =>
                  this.updateRemote(value, 'rate_limit')
                }
              />
              <FormFieldHelper
                variant={
                  !this.isNumericSet(remote.rate_limit) ||
                  Number.isInteger(remote.rate_limit)
                    ? 'default'
                    : 'error'
                }
              >
                {t`Must be an integer.`}
              </FormFieldHelper>
            </FormGroup>
          </div>
        </ExpandableSection>
        {errorMessages['__nofield'] ? (
          <span
            style={{
              color: 'var(--pf-v5-global--danger-color--200)',
            }}
          >
            {errorMessages['__nofield']}
          </span>
        ) : null}
        {extra}
      </Form>
    );
  }

  private isValid(requiredFields) {
    const { plugin, remote } = this.props;

    for (const field of requiredFields) {
      if (!remote[field] || remote[field] === '') {
        return false;
      }
    }

    if (plugin !== 'container') {
      // only required in remotes, not registries
      if (remote.download_concurrency < 1) {
        return false;
      }
    }

    if (validateURLHelper(null, remote.url).variant == 'error') {
      return false;
    }

    return true;
  }

  private updateIsSet(fieldName: string, value: boolean) {
    const { remote } = this.props;

    const newFields: HiddenFieldType[] = remote.hidden_fields.map((field) =>
      field.name === fieldName ? { ...field, is_set: value } : field,
    );

    this.props.updateRemote({
      ...remote,
      [fieldName]: null,
      hidden_fields: newFields,
    });
  }

  private updateRemote(value, field) {
    const { remote } = this.props;

    const numericFields = ['download_concurrency', 'rate_limit'];
    if (numericFields.includes(field)) {
      value = Number.isInteger(value)
        ? value
        : Number.isNaN(parseInt(value, 10))
          ? null
          : parseInt(value, 10);
    }

    this.props.updateRemote({ ...remote, [field]: value });
  }

  private isNumericSet(value) {
    return value != null && value !== '';
  }
}
