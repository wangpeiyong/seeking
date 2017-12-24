<h1>高并发分布式系统生成全局唯一的Id</h1>

数据在分片时，典型的是分库分表，就有一个全局ID生成的问题。

单纯的生成全局ID并不是什么难题，但是生成的ID通常要满足分片的一些要求：

   1 不能有单点故障。
   
   2 以时间为序，或者ID里包含时间。这样一是可以少一个索引，二是冷热数据容易分离。
   
   3 可以控制ShardingId。比如某一个用户的文章要放在同一个分片内，这样查询效率高，修改也容易。
   
   4 不要太长，最好64bit。使用long比较好操作，如果是96bit，那就要各种移位相当的不方便，还有可能有些组件不能支持这么大的ID。
   
   
<h3>方案1</h3>

SnowFlake 分布式ID生成

    /** 
    * 基于SnowFlake的序列号生成实现, 64位ID (42(毫秒)+5(机器ID)+5(业务编码)+12(重复累加)) 
    */  
    static class Generator {  
  
        private final static long TWEPOCH = 1288834974657L;  
  
        // 机器标识位数  
        private final static long WORKER_ID_BITS = 5L;  
  
        // 数据中心标识位数  
        private final static long DATA_CENTER_ID_BITS = 5L;  
  
        // 机器ID最大值 31  
        private final static long MAX_WORKER_ID = -1L ^ (-1L << WORKER_ID_BITS);  
  
        // 数据中心ID最大值 31  
        private final static long MAX_DATA_CENTER_ID = -1L ^ (-1L << DATA_CENTER_ID_BITS);  
  
        // 毫秒内自增位  
        private final static long SEQUENCE_BITS = 12L;  
  
        // 机器ID偏左移12位  
        private final static long WORKER_ID_SHIFT = SEQUENCE_BITS;  
  
        private final static long DATA_CENTER_ID_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS;  
  
        // 时间毫秒左移22位  
        private final static long TIMESTAMP_LEFT_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS + DATA_CENTER_ID_BITS;  
  
        private final static long SEQUENCE_MASK = -1L ^ (-1L << SEQUENCE_BITS);  
  
        private long lastTimestamp = -1L;  
  
        private long sequence = 0L;  
        private final long workerId;  
        private final long dataCenterId;  
          
        //private final AtomicBoolean lock = new AtomicBoolean(false);  
          
        Generator(long workerId, long dataCenterId) {  
            if (workerId > MAX_WORKER_ID || workerId < 0) {  
                throw new IllegalArgumentException(String.format("%s must range from %d to %d", K_WORK_ID, 0,  
                        MAX_WORKER_ID));  
            }  
  
            if (dataCenterId > MAX_DATA_CENTER_ID || dataCenterId < 0) {  
                throw new IllegalArgumentException(String.format("%s must range from %d to %d", K_DC_ID, 0,  
                        MAX_DATA_CENTER_ID));  
            }  
  
            this.workerId = workerId;  
            this.dataCenterId = dataCenterId;  
        }  
  
        synchronized long nextValue() throws SequenceException {  
            long timestamp = time();  
            if (timestamp < lastTimestamp) {  
                throw new SequenceException("Clock moved backwards, refuse to generate id for "  
                        + (lastTimestamp - timestamp) + " milliseconds");  
            }  
  
            if (lastTimestamp == timestamp) {  
                // 当前毫秒内，则+1  
                sequence = (sequence + 1) & SEQUENCE_MASK;  
                if (sequence == 0) {  
                    // 当前毫秒内计数满了，则等待下一秒  
                    timestamp = tilNextMillis(lastTimestamp);  
                }  
            } else {  
                sequence = 0;  
            }  
            lastTimestamp = timestamp;  
              
            // ID偏移组合生成最终的ID，并返回ID  
            long nextId = ((timestamp - TWEPOCH) << TIMESTAMP_LEFT_SHIFT)  
                    | (dataCenterId << DATA_CENTER_ID_SHIFT) | (workerId << WORKER_ID_SHIFT) | sequence;  
  
            return nextId;  
        }  
  
        private long tilNextMillis(final long lastTimestamp) {  
            long timestamp = this.time();  
            while (timestamp <= lastTimestamp) {  
                timestamp = this.time();  
            }  
            return timestamp;  
        }  
  
        private long time() {  
            return System.currentTimeMillis();  
        }  
  
    }  
    
<h3>方案2</h3>

来自Flicker的解决方案

因为MySQL本身支持auto_increment操作，很自然地，我们会想到借助这个特性来实现这个功能。

Flicker在解决全局ID生成方案里就采用了MySQL自增长ID的机制（auto_increment + replace into + MyISAM）。

一个生成64位ID方案具体就是这样的： 

先创建单独的数据库(eg:ticket)，然后创建一个表：

    CREATE TABLE Tickets64 (
      id bigint(20) unsigned NOT NULL auto_increment,
      stub char(1) NOT NULL default '',
      PRIMARY KEY (id),
      UNIQUE KEY stub (stub)
    ) ENGINE=MyISAM

在我们的应用端需要做下面这两个操作，在一个事务会话里提交：

REPLACE INTO Tickets64 (stub) VALUES ('a');

SELECT LAST_INSERT_ID();

这样我们就能拿到不断增长且不重复的ID了。 

到上面为止，我们只是在单台数据库上生成ID，从高可用角度考虑，接下来就要解决单点故障问题：
Flicker启用了两台数据库服务器来生成ID，通过区分auto_increment的起始值和步长来生成奇偶数的ID。

    TicketServer1:
    auto-increment-increment = 2
    auto-increment-offset = 1

    TicketServer2:
    auto-increment-increment = 2
    auto-increment-offset = 2

最后，在客户端只需要通过轮询方式取ID就可以了。


优点：充分借助数据库的自增ID机制，提供高可靠性，生成的ID有序。

缺点：占用两个独立的MySQL实例，有些浪费资源，成本较高。

<h3>方案3</h3>

基于redis的分布式ID生成器

首先，要知道redis的EVAL，EVALSHA命令：

原理

利用redis的lua脚本执行功能，在每个节点上通过lua脚本生成唯一ID。 

生成的ID是64位的：

使用41 bit来存放时间，精确到毫秒，可以使用41年。

使用12 bit来存放逻辑分片ID，最大分片ID是4095

使用10 bit来存放自增长ID，意味着每个节点，每毫秒最多可以生成1024个ID

比如GTM时间 Fri Mar 13 10:00:00 CST 2015 ，它的距1970年的毫秒数是 1426212000000，假定分片ID是53，自增长序列是4，则生成的ID是：

5981966696448054276 = 1426212000000 << 22 + 53 << 10 + 41

redis提供了TIME命令，可以取得redis服务器上的秒数和微秒数。因些lua脚本返回的是一个四元组。

second, microSecond, partition, seq

客户端要自己处理，生成最终ID。

((second * 1000 + microSecond / 1000) << (12 + 10)) + (shardId << 10) + seq;
