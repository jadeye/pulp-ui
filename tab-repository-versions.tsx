import { t } from '@lingui/core/macro';
import { Table, Td, Th, Tr } from '@patternfly/react-table';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  DebianRepositoryAPI,
  type DebianRepositoryType,
  GenericPulpAPI,
} from 'src/api';
import {
  DateComponent,
  DetailList,
  Details,
  ListItemActions,
  Spinner,
} from 'src/components';
import { Paths, formatPath } from 'src/paths';
import { config } from 'src/ui-config';
import { parsePulpIDFromURL } from 'src/utilities';

interface TabProps {
  item: DebianRepositoryType;
  actionContext: {
    addAlert: (alert) => void;
    state: { params };
    hasPermission: (string) => boolean;
    hasObjectPermission: (string) => boolean;
  };
}

type ContentSummary = Record<
  string,
  {
    count: number;
    href: string;
  }
>;

interface DebianRepositoryVersionType {
  pulp_href: string;
  pulp_created: string;
  number: number;
  repository: string;
  base_version: null;
  content_summary: {
    added: ContentSummary;
    removed: ContentSummary;
    present: ContentSummary;
  };
}

const VersionContent = ({
  href,
  addAlert,
  hasPermission,
  repositoryName,
}: {
  href: string;
  addAlert: (alert) => void;
  hasPermission: (string) => boolean;
  repositoryName: string;
}) => {
  const [state, setState] = useState({});
  if (!href) {
    return null;
  }

  // @ts-expect-error: TS2339: Property 'params' does not exist on type '{}'.
  const query = ({ params } = {}) =>
    GenericPulpAPI.list(href.replace(config.API_BASE_PATH, ''), params);

  const renderTableRow = ({
    manifest: {
      collection_info: { namespace, name, version },
    },
    description,
  }) => (
    <Tr>
      <Td>
        <Link
          to={formatPath(
            Paths.debian.repository.detail,
            {
              repo: repositoryName,
              namespace,
              collection: name,
            },
            {
              version,
            },
          )}
        >
          {namespace}.{name} v{version}
        </Link>
      </Td>
      <Td>{description}</Td>
    </Tr>
  );

  return (
    <DetailList<{ manifest; description; pulp_href }>
      actionContext={{
        addAlert,
        state,
        setState,
        query,
        hasPermission,
      }}
      defaultPageSize={10}
      defaultSort={'name'}
      errorTitle={t`Collection versions could not be displayed.`}
      noDataDescription={t`No collection versions in this repository version.`}
      noDataTitle={t`No collection versions yet`}
      query={query}
      renderTableRow={renderTableRow}
      sortHeaders={[
        {
          title: t`Collection`,
          type: 'none',
          id: 'col1',
        },
        {
          title: t`Description`,
          type: 'none',
          id: 'col2',
        },
      ]}
      title={t`Collection versions`}
    />
  );
};

const ContentSummary = ({ data }: { data: object }) => {
  if (!Object.keys(data).length) {
    return <>{t`None`}</>;
  }

  return (
    <Table>
      <Tr>
        <Th>{t`Count`}</Th>
        <Th>{t`Pulp type`}</Th>
      </Tr>
      {Object.entries(data).map(([k, v]) => (
        <Tr key={k}>
          <Td>{v['count']}</Td>
          <Th>{k}</Th>
        </Tr>
      ))}
    </Table>
  );
};

const BaseVersion = ({
  repositoryName,
  data,
}: {
  repositoryName: string;
  data?: string;
}) => {
  if (!data) {
    return <>{t`None`}</>;
  }

  const number = data.split('/').at(-2);
  return (
    <Link
      to={formatPath(
        Paths.debian.repository.detail,
        {
          name: repositoryName,
        },
        {
          repositoryVersion: number,
          tab: 'repository-versions',
        },
      )}
    >
      {number}
    </Link>
  );
};

export const RepositoryVersionsTab = ({
  item,
  actionContext: { addAlert, state, hasPermission, hasObjectPermission },
}: TabProps) => {
  const pulpId = parsePulpIDFromURL(item.pulp_href);
  const latest_href = item.latest_version_href;
  const repositoryName = item.name;
  const queryList = ({ params }) =>
    DebianRepositoryAPI.listVersions(pulpId, params);
  const queryDetail = ({ number }) =>
    DebianRepositoryAPI.listVersions(pulpId, { number });
  const [modalState, setModalState] = useState({});
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (state.params.repositoryVersion) {
      queryDetail({ number: state.params.repositoryVersion }).then(
        ({ data }) => {
          if (!data?.results?.[0]) {
            addAlert({
              variant: 'danger',
              title: t`Failed to find repository version`,
            });
          }
          setVersion(data.results[0]);
        },
      );
    } else {
      setVersion(null);
    }
  }, [state.params.repositoryVersion]);

  const renderTableRow = (
    item: DebianRepositoryVersionType,
    index: number,
    actionContext,
    listItemActions,
  ) => {
    const { number, pulp_created, pulp_href } = item;

    const isLatest = latest_href === pulp_href;

    const kebabItems = listItemActions.map((action) =>
      action.dropdownItem({ ...item, isLatest, repositoryName }, actionContext),
    );

    return (
      <Tr key={index}>
        <Td>
          <Link
            to={formatPath(
              Paths.debian.repository.detail,
              {
                name: repositoryName,
              },
              {
                repositoryVersion: number,
                tab: 'repository-versions',
              },
            )}
          >
            {number}
          </Link>
          {isLatest ? ' ' + t`(latest)` : null}
        </Td>
        <Td>
          <DateComponent date={pulp_created} />
        </Td>
        <ListItemActions kebabItems={kebabItems} />
      </Tr>
    );
  };

  return state.params.repositoryVersion ? (
    version ? (
      <>
        <Details
          fields={[
            { label: t`Version number`, value: version.number },
            {
              label: t`Created date`,
              value: <DateComponent date={version.pulp_created} />,
            },
            {
              label: t`Content added`,
              value: <ContentSummary data={version.content_summary?.added} />,
            },
            {
              label: t`Content removed`,
              value: <ContentSummary data={version.content_summary?.removed} />,
            },
            {
              label: t`Current content`,
              value: <ContentSummary data={version.content_summary?.present} />,
            },
            {
              label: t`Base version`,
              value: (
                <BaseVersion
                  repositoryName={repositoryName}
                  data={version.base_version}
                />
              ),
            },
          ]}
        />
        <div
          className='pf-v5-c-page__main-section'
          style={{ padding: '8px 0', margin: '24px -16px 0' }}
        />
        <VersionContent
          {...version.content_summary.present['debian.collection_version']}
          repositoryName={repositoryName}
        />
      </>
    ) : (
      <Spinner size='md' />
    )
  ) : (
    <DetailList<DebianRepositoryVersionType>
      actionContext={{
        addAlert,
        state: modalState,
        setState: setModalState,
        query: queryList,
        hasPermission,
        hasObjectPermission, // needs item=repository, not repository version
      }}
      defaultPageSize={10}
      defaultSort={'-pulp_created'}
      errorTitle={t`Repository versions could not be displayed.`}
      filterConfig={null}
      listItemActions={[debianRepositoryVersionRevertAction]}
      noDataButton={null}
      noDataDescription={t`Repository versions will appear once the repository is modified.`}
      noDataTitle={t`No repository versions yet`}
      query={queryList}
      renderTableRow={renderTableRow}
      sortHeaders={[
        {
          title: t`Version number`,
          type: 'numeric',
          id: 'number',
        },
        {
          title: t`Created date`,
          type: 'numeric',
          id: 'pulp_created',
        },
      ]}
      title={t`Repository versions`}
    />
  );
};
